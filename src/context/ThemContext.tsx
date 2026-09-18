import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";
import { DarkTheme, LightTheme } from "../constants/theme";

interface ThemeContextType {
  theme: typeof LightTheme;
  isDark: boolean;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | null>(null);

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
};

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [isDark, setIsDark] = useState(false);
  const theme = isDark ? DarkTheme : LightTheme;

  useEffect(() => {
    // ✅ Use AsyncStorage instead of localStorage (localStorage doesn't exist in React Native)
    const loadTheme = async () => {
      try {
        const val = await AsyncStorage.getItem("theme");
        if (val === "dark") setIsDark(true);
      } catch (e) {
        // ignore
      }
    };
    loadTheme();
  }, []);

  const toggleTheme = () => {
    const newVal = !isDark;
    setIsDark(newVal);
    // ✅ Use AsyncStorage instead of localStorage
    AsyncStorage.setItem("theme", newVal ? "dark" : "light").catch(() => {});
  };

  return (
    <ThemeContext.Provider value={{ theme, isDark, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
