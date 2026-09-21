import React, { useEffect, useRef } from "react";
import { View, Text, Animated, Easing } from "react-native";
import { D } from "../theme";

// Equivalente a la pantalla de carga del PC. React Native no tiene keyframes CSS,
// así que las mismas animaciones (letras en cascada, latido y barra deslizante) se
// hacen con la API Animated.
export default function Splash({ label }) {
  const letras = ["L", "i", "x", "T"];
  const subir  = useRef(letras.map(() => new Animated.Value(0))).current;
  const latido = useRef(new Animated.Value(1)).current;
  const barra  = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Cascada: cada letra entra 80 ms después de la anterior
    Animated.stagger(80, subir.map(v =>
      Animated.timing(v, { toValue: 1, duration: 500, easing: Easing.bezier(0.2, 0.8, 0.3, 1), useNativeDriver: true })
    )).start(() => {
      // Al terminar, las letras quedan latiendo
      Animated.loop(
        Animated.sequence([
          Animated.timing(latido, { toValue: 0.55, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(latido, { toValue: 1,    duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ])
      ).start();
    });

    // Barra de progreso indeterminada
    Animated.loop(
      Animated.timing(barra, { toValue: 1, duration: 1300, easing: Easing.inOut(Easing.ease), useNativeDriver: true })
    ).start();
  }, []);

  const ANCHO_BARRA = 180;

  return (
    <View style={{ flex: 1, backgroundColor: D.bg, alignItems: "center", justifyContent: "center" }}>
      <View style={{ flexDirection: "row", marginBottom: 26 }}>
        {letras.map((ch, i) => (
          <Animated.Text key={i} style={{
            fontSize: 52, fontWeight: "800", letterSpacing: -2,
            color: i === 3 ? D.accent : D.text,
            opacity: Animated.multiply(subir[i], latido),
            transform: [{ translateY: subir[i].interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }],
          }}>
            {ch}
          </Animated.Text>
        ))}
      </View>

      <View style={{ width: ANCHO_BARRA, height: 3, borderRadius: 3, backgroundColor: D.card2, overflow: "hidden" }}>
        <Animated.View style={{
          width: ANCHO_BARRA * 0.4, height: "100%", borderRadius: 4, backgroundColor: D.accent,
          transform: [{ translateX: barra.interpolate({ inputRange: [0, 1], outputRange: [-ANCHO_BARRA * 0.4, ANCHO_BARRA] }) }],
        }} />
      </View>

      {!!label && (
        <Text style={{ color: D.muted, fontSize: 12, marginTop: 18 }}>{label}</Text>
      )}
    </View>
  );
}
