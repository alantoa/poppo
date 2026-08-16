import "./src/input.css";
import type { ReactNode } from "react";
import { Text, useWindowDimensions, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { Playground } from "./src/playground";
import {
  darkTheme,
  lightTheme,
  monoFont,
  type Theme,
  type ThemeName,
} from "./src/theme";

const FRAME_WIDTH = 390;
const FRAME_HEIGHT = 844;

const DeviceFrame = ({
  theme,
  name,
  children,
}: {
  theme: Theme;
  name: ThemeName;
  children: ReactNode;
}) => (
  <View style={{ gap: 14, alignItems: "center" }}>
    <Text
      style={{
        color: theme.muted,
        fontFamily: monoFont,
        fontSize: 11,
        letterSpacing: 1.4,
        textTransform: "uppercase",
      }}
    >
      {name}
    </Text>
    <View
      style={{
        width: FRAME_WIDTH,
        height: FRAME_HEIGHT,
        borderRadius: 36,
        overflow: "hidden",
        borderWidth: 1,
        borderColor: theme.hairline,
        backgroundColor: theme.canvas,
      }}
    >
      {children}
    </View>
  </View>
);

export default function App() {
  const { width } = useWindowDimensions();
  const sideBySide = width >= FRAME_WIDTH * 2 + 80;

  return (
    <SafeAreaProvider>
      <View
        style={{
          flex: 1,
          backgroundColor: "#111110",
          alignItems: "center",
          justifyContent: sideBySide ? "center" : "flex-start",
          paddingVertical: 40,
          paddingHorizontal: 24,
        }}
      >
        {sideBySide ? (
          <View style={{ flexDirection: "row", gap: 40 }}>
            <DeviceFrame theme={lightTheme} name="light">
              <Playground lockedTheme="light" />
            </DeviceFrame>
            <DeviceFrame theme={darkTheme} name="dark">
              <Playground lockedTheme="dark" />
            </DeviceFrame>
          </View>
        ) : (
          <View style={{ width: "100%", maxWidth: 480, flex: 1 }}>
            <Playground />
          </View>
        )}
      </View>
    </SafeAreaProvider>
  );
}
