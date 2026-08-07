// components/Logo.tsx
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Image, StyleSheet, Text, View } from "react-native";

interface LogoProps {
  size?: number;
  showText?: boolean;
  textColor?: string;
  iconColor?: string;
}

export default function Logo({ 
  size = 40, 
  showText = true, 
  textColor = "#FFF",
  iconColor = "#4CAF50"
}: LogoProps) {
  const [hasError, setHasError] = React.useState(false);

  if (hasError) {
    return (
      <View style={styles.container}>
        <View style={[styles.iconContainer, { width: size, height: size, borderRadius: size / 2 }]}>
          <Ionicons name="leaf" size={size * 0.5} color={iconColor} />
        </View>
        {showText && <Text style={[styles.text, { color: textColor, fontSize: size * 0.6 }]}>AgriArch</Text>}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Image
        source={require("../assets/images/Logo.png")}
        style={[styles.image, { width: size, height: size, borderRadius: size / 3 }]}
        resizeMode="contain"
        onError={() => setHasError(true)}
      />
      {showText && <Text style={[styles.text, { color: textColor, fontSize: size * 0.6 }]}>AgriArch</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  image: {
    // Size is dynamic
  },
  iconContainer: {
    backgroundColor: "rgba(76, 175, 80, 0.15)",
    justifyContent: "center",
    alignItems: "center",
  },
  text: {
    fontWeight: "700",
    letterSpacing: 0.5,
  },
});