import { createContext, useContext } from "react";
import { Platform } from "react-native";

export type ThemeName = "light" | "dark";

export type Theme = {
  name: ThemeName;
  statusBar: "dark" | "light";
  canvas: string;
  canvasSoft: string;
  card: string;
  ink: string;
  body: string;
  muted: string;
  hairline: string;
  primary: string;
  onPrimary: string;
  bubble: string;
  onBubble: string;
  accent: string;
  success: string;
  radius: {
    button: number;
    card: number;
    bubble: number;
  };
  displayTracking: number;
  eyebrowTracking: number;
};

export const monoFont = Platform.select({
  ios: "Menlo",
  android: "monospace",
  default: "ui-monospace, SFMono-Regular, Menlo, Monaco, monospace",
});

const radius = { button: 8, card: 12, bubble: 8 } as const;

export const lightTheme: Theme = {
  name: "light",
  statusBar: "dark",
  canvas: "#f7f7f4",
  canvasSoft: "#fafaf7",
  card: "#ffffff",
  ink: "#26251e",
  body: "#5a5852",
  muted: "#807d72",
  hairline: "#e6e5e0",
  primary: "#26251e",
  onPrimary: "#f7f7f4",
  bubble: "#26251e",
  onBubble: "#f7f7f4",
  accent: "#f54e00",
  success: "#1f8a65",
  radius,
  displayTracking: -0.4,
  eyebrowTracking: 0.8,
};

export const darkTheme: Theme = {
  name: "dark",
  statusBar: "light",
  canvas: "#141413",
  canvasSoft: "#1b1a16",
  card: "#1e1d19",
  ink: "#f2f1ed",
  body: "#b8b5ad",
  muted: "#8a8780",
  hairline: "#2e2c27",
  primary: "#f2f1ed",
  onPrimary: "#141413",
  bubble: "#f2f1ed",
  onBubble: "#26251e",
  accent: "#f54e00",
  success: "#3cb88a",
  radius,
  displayTracking: -0.4,
  eyebrowTracking: 0.8,
};

export const themes: Record<ThemeName, Theme> = {
  light: lightTheme,
  dark: darkTheme,
};

export const ThemeContext = createContext<Theme>(lightTheme);

export const useTheme = () => useContext(ThemeContext);
