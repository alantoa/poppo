import React from "react";
import {
  Pressable,
  Text,
  View,
  type PressableProps,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";

import {
  ThemeContext,
  monoFont,
  themes,
  useTheme,
  type Theme,
  type ThemeName,
} from "./theme";

export { useTheme } from "./theme";
export type { Theme, ThemeName } from "./theme";

export const ThemeProvider = ({
  name,
  children,
}: {
  name: ThemeName;
  children: React.ReactNode;
}) => (
  <ThemeContext.Provider value={themes[name]}>{children}</ThemeContext.Provider>
);

const HIT = 44;

export const bubbleStyle = (theme: Theme): ViewStyle & TextStyle => ({
  backgroundColor: theme.bubble,
  borderRadius: theme.radius.bubble,
  paddingHorizontal: 16,
  paddingVertical: 12,
  maxWidth: 260,
  fontSize: 14,
  lineHeight: 21,
  fontWeight: "400",
  color: theme.onBubble,
});

export const Eyebrow = ({ children }: { children: string }) => {
  const theme = useTheme();
  return (
    <Text
      style={{
        color: theme.muted,
        fontFamily: monoFont,
        fontSize: 11,
        fontWeight: "400",
        letterSpacing: theme.eyebrowTracking,
        textTransform: "uppercase",
      }}
    >
      {children}
    </Text>
  );
};

export const Display = ({ children }: { children: string }) => {
  const theme = useTheme();
  return (
    <Text
      style={{
        color: theme.ink,
        fontSize: 32,
        fontWeight: "400",
        letterSpacing: theme.displayTracking,
        lineHeight: 38,
      }}
    >
      {children}
    </Text>
  );
};

export const Body = ({
  children,
  style,
}: {
  children: string;
  style?: StyleProp<TextStyle>;
}) => {
  const theme = useTheme();
  return (
    <Text style={[{ color: theme.body, fontSize: 14, lineHeight: 21 }, style]}>
      {children}
    </Text>
  );
};

const buttonSurface = (
  theme: Theme,
  pressed: boolean,
  variant: "solid" | "ghost",
): ViewStyle => {
  if (variant === "ghost") {
    return {
      minHeight: HIT,
      minWidth: HIT,
      paddingHorizontal: 16,
      borderRadius: theme.radius.button,
      borderWidth: 1,
      borderColor: pressed ? theme.ink : theme.hairline,
      backgroundColor: pressed ? theme.canvasSoft : "transparent",
      alignItems: "center",
      justifyContent: "center",
    };
  }
  return {
    minHeight: HIT,
    minWidth: HIT,
    paddingHorizontal: 16,
    borderRadius: theme.radius.button,
    backgroundColor: pressed ? theme.ink : theme.primary,
    alignItems: "center",
    justifyContent: "center",
  };
};

const buttonLabel = (theme: Theme, variant: "solid" | "ghost"): TextStyle => ({
  color: variant === "solid" ? theme.onPrimary : theme.ink,
  fontSize: 14,
  fontWeight: "400",
  letterSpacing: -0.2,
});

// Pressed state is tracked by hand instead of through Pressable's
// `style={({ pressed }) => ...}` callback: NativeWind wraps Pressable and
// drops function styles, which left every button in this playground with no
// surface at all.
export const Button = ({
  label,
  variant = "ghost",
  style,
  onPressIn,
  onPressOut,
  ...rest
}: PressableProps & { label: string; variant?: "solid" | "ghost" }) => {
  const theme = useTheme();
  const [pressed, setPressed] = React.useState(false);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      {...rest}
      onPressIn={(event) => {
        setPressed(true);
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        setPressed(false);
        onPressOut?.(event);
      }}
      style={[
        buttonSurface(theme, pressed, variant),
        { opacity: rest.disabled ? 0.4 : 1 },
        style as ViewStyle,
      ]}
    >
      <Text style={buttonLabel(theme, variant)}>{label}</Text>
    </Pressable>
  );
};

export const TriggerChip = ({
  label,
  variant = "ghost",
}: {
  label: string;
  variant?: "solid" | "ghost";
}) => {
  const theme = useTheme();
  return (
    <View
      style={[buttonSurface(theme, false, variant), { alignSelf: "flex-start" }]}
      accessibilityLabel={label}
    >
      <Text style={buttonLabel(theme, variant)}>{label}</Text>
    </View>
  );
};

export const Card = ({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) => {
  const theme = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: theme.card,
          borderRadius: theme.radius.card,
          borderWidth: 1,
          borderColor: theme.hairline,
          overflow: "hidden",
        },
        style,
      ]}
    >
      {children}
    </View>
  );
};

export const Section = ({
  index,
  title,
  hint,
  children,
}: {
  index: string;
  title: string;
  hint?: string;
  children: React.ReactNode;
}) => {
  const theme = useTheme();
  const rows = React.Children.toArray(children).filter(Boolean);
  return (
    <View style={{ gap: 12 }}>
      <View style={{ gap: 4, paddingHorizontal: 4 }}>
        <Eyebrow>{`${index}  ${title}`}</Eyebrow>
        {hint ? <Body>{hint}</Body> : null}
      </View>
      <Card>
        {rows.map((child, i) => (
          <React.Fragment key={i}>
            {child}
            {i < rows.length - 1 ? (
              <View
                style={{
                  height: 1,
                  backgroundColor: theme.hairline,
                  marginLeft: 16,
                }}
              />
            ) : null}
          </React.Fragment>
        ))}
      </Card>
    </View>
  );
};

export const Row = ({
  label,
  subtitle,
  stack,
  children,
}: {
  label: string;
  subtitle?: string;
  stack?: boolean;
  children?: React.ReactNode;
}) => {
  const theme = useTheme();
  return (
    <View
      style={{
        minHeight: 64,
        paddingHorizontal: 16,
        paddingVertical: 14,
        flexDirection: stack ? "column" : "row",
        alignItems: stack ? "stretch" : "center",
        gap: stack ? 12 : 16,
      }}
    >
      <View style={{ flex: stack ? undefined : 1, gap: 3 }}>
        <Text style={{ color: theme.ink, fontSize: 16, fontWeight: "400" }}>
          {label}
        </Text>
        {subtitle ? (
          <Text style={{ color: theme.muted, fontSize: 13, lineHeight: 18 }}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {children}
    </View>
  );
};

export const Segmented = <T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (next: T) => void;
}) => {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        backgroundColor: theme.canvas,
        borderRadius: theme.radius.button,
        borderWidth: 1,
        borderColor: theme.hairline,
        padding: 3,
        flexWrap: "wrap",
      }}
    >
      {options.map((option) => {
        const selected = value === option.value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={option.label}
            testID={`segment-${option.value}`}
            onPress={() => onChange(option.value)}
            style={{
              minHeight: HIT,
              paddingHorizontal: 14,
              borderRadius: theme.radius.button,
              backgroundColor: selected ? theme.card : "transparent",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text
              style={{
                color: selected ? theme.ink : theme.muted,
                fontSize: 13,
                fontWeight: "400",
              }}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
};

export const ThemeSwitch = ({
  value,
  onChange,
}: {
  value: ThemeName;
  onChange: (next: ThemeName) => void;
}) => {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: "row", gap: 8 }}>
      {(["light", "dark"] as const).map((name) => {
        const selected = value === name;
        return (
          <Pressable
            key={name}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={`${name} mode`}
            testID={`theme-${name}`}
            onPress={() => onChange(name)}
            style={{
              flex: 1,
              minHeight: HIT,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: theme.radius.button,
              borderWidth: 1,
              borderColor: selected ? theme.ink : theme.hairline,
              backgroundColor: selected ? theme.ink : "transparent",
            }}
          >
            <Text
              style={{
                color: selected ? theme.onPrimary : theme.ink,
                fontSize: 14,
                fontWeight: "400",
                letterSpacing: -0.2,
              }}
            >
              {name === "light" ? "Light" : "Dark"}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
};
