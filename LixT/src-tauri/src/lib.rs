use std::fs;
use std::path::Path;

/// Escribe un backup en la carpeta que el usuario eligió y deja solo los
/// `conservar` más recientes.
///
/// Se hace aquí y no con `tauri-plugin-fs` a propósito: ese plugin decide a qué
/// rutas puede escribir la app en tiempo de compilación, y aquí la carpeta la
/// elige el usuario en marcha. Abrirle el scope a media unidad para esto sería
/// peor. El diálogo del sistema ya es la autorización.
///
/// La rotación se apoya en que el nombre lleva la fecha dentro
/// (lixt-backup-AAAA-MM-DD-HHMM.json), así que ordenar por nombre es ordenar por
/// antigüedad. Solo se tocan archivos con ese prefijo: si eliges una carpeta con
/// otras cosas dentro, no se borra nada que no sea nuestro.
#[tauri::command]
fn guardar_backup(
    carpeta: String,
    nombre: String,
    contenido: String,
    conservar: usize,
) -> Result<String, String> {
    let dir = Path::new(&carpeta);
    if !dir.is_dir() {
        return Err("La carpeta de backup ya no existe. Vuelve a elegirla en Ajustes.".into());
    }
    // El nombre lo genera la app, pero se comprueba igual: sin esto un ".." lo
    // dejaría escribir fuera de la carpeta autorizada.
    if nombre.contains('/') || nombre.contains('\\') || nombre.contains("..") {
        return Err("Nombre de archivo inválido.".into());
    }

    let destino = dir.join(&nombre);
    fs::write(&destino, contenido).map_err(|e| format!("No se pudo escribir: {e}"))?;

    let mut mios: Vec<String> = fs::read_dir(dir)
        .map_err(|e| format!("No se pudo leer la carpeta: {e}"))?
        .filter_map(|e| e.ok())
        .map(|e| e.file_name().to_string_lossy().into_owned())
        .filter(|n| n.starts_with("lixt-backup-") && n.ends_with(".json"))
        .collect();
    mios.sort();

    if mios.len() > conservar {
        for viejo in &mios[..mios.len() - conservar] {
            let _ = fs::remove_file(dir.join(viejo)); // si falla, se reintenta al siguiente cierre
        }
    }

    Ok(destino.to_string_lossy().into_owned())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![guardar_backup])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
