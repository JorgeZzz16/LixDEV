// Dos apps instaladas a la vez: la de diario (`com.lixt.app`, APK normal, no
// necesita el ordenador) y la de desarrollo, que es otra app distinta para que
// instalar una no desinstale la otra. Solo se pisan el nombre y el package;
// el resto sale tal cual de app.json.
const DEV = process.env.APP_VARIANT === "development";

module.exports = ({ config }) => ({
  ...config,
  name: DEV ? "LixDEV" : "LixT",
  android: {
    ...config.android,
    package: DEV ? "com.lixt.app.dev" : "com.lixt.app",
    // Mismo logo y mismo fondo oscuro en las dos, pero en la de desarrollo el
    // lazo carmesi va en amarillo. Se distinguen de un vistazo en el cajon de
    // aplicaciones. El PNG amarillo sale del normal recoloreando #BB0039.
    adaptiveIcon: {
      ...config.android.adaptiveIcon,
      ...(DEV && { foregroundImage: "./assets/android-icon-foreground-dev.png" }),
    },
  },
});
