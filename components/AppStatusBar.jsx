// components/AppStatusBar.jsx
// Centralized status bar — the single source of truth for the entire app.
//
// Render it ONCE in the root layout (app/_layout.jsx) so every screen shares
// the same, theme-aware status bar configuration instead of each component
// managing its own.
//
// Screens with special top-of-screen designs (e.g. dark hero images) can pass
// an explicit `style` prop to override the theme default for that screen only:
//   <AppStatusBar style="light" />
import { StatusBar as ExpoStatusBar } from "expo-status-bar";
import React from "react";
import { useTheme } from "../src/context/ThemContext";

export default function AppStatusBar({ style, ...props }) {
  const { theme } = useTheme();

  return (
    <ExpoStatusBar
      style={style || (theme.dark ? "light" : "dark")}
      {...props}
    />
  );
}
