import Ionicons from "@expo/vector-icons/Ionicons";
import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import { Pressable, ScrollView, Text, useColorScheme, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Popover,
  Toast,
  Tooltip,
  useToastManager,
} from "universal-tooltip";
import type { Side, ToastObject, ToastViewportPosition } from "universal-tooltip";

import { isMobileWeb } from "./platform";
import {
  Body,
  Button,
  Display,
  Eyebrow,
  Row,
  Section,
  Segmented,
  ThemeProvider,
  ThemeSwitch,
  TriggerChip,
  bubbleStyle,
  useTheme,
} from "./ui";
import type { ThemeName } from "./theme";

const Hint = isMobileWeb() ? Popover : Tooltip;

const SIDES: { value: Side; label: string }[] = [
  { value: "top", label: "Top" },
  { value: "bottom", label: "Bottom" },
  { value: "left", label: "Left" },
  { value: "right", label: "Right" },
];

const POSITIONS: { value: ToastViewportPosition; label: string }[] = [
  { value: "bottom", label: "Bottom" },
  { value: "top", label: "Top" },
  { value: "top-end", label: "Top end" },
];

const HintTooltip = ({
  text,
  side = "top",
  label,
  testID,
}: {
  text: string;
  side?: Side;
  label: string;
  testID: string;
}) => {
  const theme = useTheme();
  return (
    <Hint.Root>
      <Hint.Trigger delay={150} testID={testID} accessibilityLabel={label}>
        <TriggerChip label={label} />
      </Hint.Trigger>
      <Hint.Portal>
        <Hint.Positioner side={side} sideOffset={8}>
          <Hint.Popup presetAnimation="fadeIn" style={bubbleStyle(theme)}>
            {text}
            <Hint.Arrow width={14} height={8} />
          </Hint.Popup>
        </Hint.Positioner>
      </Hint.Portal>
    </Hint.Root>
  );
};

const RichTooltip = () => {
  const theme = useTheme();
  return (
    <Hint.Root>
      <Hint.Trigger delay={150} testID="demo-tooltip-rich" accessibilityLabel="Show rich tooltip">
        <TriggerChip label="Show" />
      </Hint.Trigger>
      <Hint.Portal>
        <Hint.Positioner side="top" sideOffset={8}>
          <Hint.Popup presetAnimation="fadeIn">
            <View
              style={{
                maxWidth: 260,
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                backgroundColor: theme.bubble,
                borderRadius: theme.radius.bubble,
                paddingHorizontal: 16,
                paddingVertical: 12,
              }}
            >
              <Ionicons name="wifi" size={20} color={theme.accent} />
              <View style={{ flexShrink: 1, gap: 2 }}>
                <Text
                  style={{
                    color: theme.onBubble,
                    fontSize: 14,
                    fontWeight: "500",
                  }}
                >
                  Network available
                </Text>
                <Text
                  style={{ color: theme.onBubble, fontSize: 13, opacity: 0.72 }}
                >
                  Any React view works — icon, layout, styles
                </Text>
              </View>
            </View>
            <Hint.Arrow
              width={14}
              height={8}
              backgroundColor={theme.bubble}
            />
          </Hint.Popup>
        </Hint.Positioner>
      </Hint.Portal>
    </Hint.Root>
  );
};

const ConfirmPopover = () => {
  const theme = useTheme();
  const toast = useToastManager();
  const [removePressed, setRemovePressed] = useState(false);
  return (
    <Popover.Root>
      <Popover.Trigger testID="demo-popover-confirm" accessibilityLabel="Open confirm popover">
        <TriggerChip label="Open" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="top" sideOffset={8}>
          <Popover.Popup presetAnimation="fadeIn">
            <View
              style={{
                width: 268,
                backgroundColor: theme.bubble,
                borderRadius: theme.radius.bubble,
                padding: 16,
                gap: 10,
              }}
            >
              <Text
                style={{
                  color: theme.onBubble,
                  fontSize: 16,
                  fontWeight: "500",
                }}
              >
                Remove download?
              </Text>
              <Text
                style={{
                  color: theme.onBubble,
                  fontSize: 13,
                  lineHeight: 19,
                  opacity: 0.72,
                }}
              >
                Buttons inside popovers stay interactive on every platform.
              </Text>
              <Pressable
                testID="demo-popover-remove"
                accessibilityRole="button"
                accessibilityLabel="Remove"
                onPressIn={() => setRemovePressed(true)}
                onPressOut={() => setRemovePressed(false)}
                onPress={() =>
                  toast.add({
                    id: "removed",
                    title: "Download removed",
                    description: "You can download it again anytime",
                  })
                }
                style={{
                  alignSelf: "flex-start",
                  minHeight: 40,
                  paddingHorizontal: 16,
                  borderRadius: theme.radius.button,
                  backgroundColor: removePressed
                    ? theme.canvas
                    : theme.onBubble,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text
                  style={{
                    color: theme.bubble,
                    fontSize: 14,
                    fontWeight: "500",
                  }}
                >
                  Remove
                </Text>
              </Pressable>
            </View>
            <Popover.Arrow
              width={14}
              height={8}
              backgroundColor={theme.bubble}
            />
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
};

const DemoToast = ({ toast }: { toast: ToastObject }) => {
  const theme = useTheme();
  const data = (toast.data ?? {}) as {
    actionLabel?: string;
    dismissible?: boolean;
  };
  return (
    <Toast.Root
      key={theme.name}
      toast={toast}
      presetAnimation="slide"
      style={{
        maxWidth: 360,
        alignSelf: "center",
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        backgroundColor: theme.card,
        borderRadius: theme.radius.card,
        borderWidth: 1,
        borderColor: theme.hairline,
        paddingLeft: 16,
        paddingRight: 16,
        paddingVertical: 14,
      }}
    >
      <Ionicons
        name="checkmark-circle"
        size={18}
        color={theme.success}
      />
      <View style={{ flexShrink: 1, gap: 2 }}>
        <Toast.Title
          style={{
            color: theme.ink,
            fontSize: 15,
            fontWeight: "500",
            lineHeight: 20,
          }}
        />
        <Toast.Description
          style={{
            color: theme.body,
            fontSize: 13,
            lineHeight: 18,
          }}
        />
      </View>
      {data.actionLabel ? (
        <Toast.Action
          testID="demo-toast-action-btn"
          style={{
            minHeight: 36,
            paddingHorizontal: 14,
            borderRadius: theme.radius.button,
            backgroundColor: theme.ink,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text
            style={{
              color: theme.onPrimary,
              fontSize: 13,
              fontWeight: "500",
            }}
          >
            {data.actionLabel}
          </Text>
        </Toast.Action>
      ) : null}
      {data.dismissible ? (
        <Toast.Close hitSlop={12} testID="demo-toast-close">
          <View
            style={{
              width: 32,
              height: 32,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons name="close" size={16} color={theme.muted} />
          </View>
        </Toast.Close>
      ) : null}
    </Toast.Root>
  );
};

const ToastViewport = ({ position }: { position: ToastViewportPosition }) => {
  const { toasts } = useToastManager();
  const insets = useSafeAreaInsets();
  return (
    <Toast.Viewport position={position} insets={insets}>
      {toasts.map((toast) => (
        <DemoToast key={toast.id} toast={toast} />
      ))}
    </Toast.Viewport>
  );
};

const Gallery = ({
  position,
  setPosition,
}: {
  position: ToastViewportPosition;
  setPosition: (next: ToastViewportPosition) => void;
}) => {
  const toast = useToastManager();

  return (
    <View style={{ gap: 28 }}>
      <Section
        index="01"
        title="Tooltip"
        hint="Hover on web · press on native. Text-only bubbles render natively."
      >
        <Row label="Text hint" subtitle="Saved to your library">
          <HintTooltip
            testID="demo-tooltip-text"
            label="Show"
            text="Saved to your library"
          />
        </Row>
        <Row label="Placement" subtitle="Opens on the chosen side" stack>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {SIDES.map((side) => (
              <HintTooltip
                key={side.value}
                testID={`demo-tooltip-${side.value}`}
                side={side.value}
                label={side.label}
                text={side.label}
              />
            ))}
          </View>
        </Row>
        <Row label="Rich content" subtitle="Icon + custom layout">
          <RichTooltip />
        </Row>
      </Section>

      <Section
        index="02"
        title="Popover"
        hint="Opens on press everywhere. Content stays interactive."
      >
        <Row label="Confirmation" subtitle="Action inside the popup">
          <ConfirmPopover />
        </Row>
      </Section>

      <Section
        index="03"
        title="Toast"
        hint="Same id refreshes. Different ids queue. Timeout 0 stays."
      >
        <Row label="Title">
          <Button
            testID="demo-toast-title"
            label="Show"
            onPress={() => toast.add({ id: "title", title: "Saved" })}
          />
        </Row>
        <Row label="Description" subtitle="Title + supporting line">
          <Button
            testID="demo-toast-description"
            label="Show"
            onPress={() =>
              toast.add({
                id: "desc",
                title: "Backup complete",
                description: "128 photos synced to iCloud",
              })
            }
          />
        </Row>
        <Row label="Action" subtitle="Undo closes the toast">
          <Button
            testID="demo-toast-action"
            label="Show"
            onPress={() =>
              toast.add({
                id: "action",
                title: "Download removed",
                data: { actionLabel: "Undo" },
              })
            }
          />
        </Row>
        <Row label="Dismissible" subtitle="timeout: 0">
          <Button
            testID="demo-toast-dismiss"
            label="Show"
            onPress={() =>
              toast.add({
                id: "sticky",
                title: "Storage almost full",
                description: "Manage storage in Settings",
                timeout: 0,
                data: { dismissible: true },
              })
            }
          />
        </Row>
        <Row label="Position" stack>
          <Segmented
            options={POSITIONS}
            value={position}
            onChange={setPosition}
          />
        </Row>
      </Section>
    </View>
  );
};

const Shell = ({
  themeName,
  onThemeChange,
  showSwitcher,
}: {
  themeName: ThemeName;
  onThemeChange?: (next: ThemeName) => void;
  showSwitcher: boolean;
}) => {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [position, setPosition] = useState<ToastViewportPosition>("bottom");

  return (
    <View style={{ flex: 1, backgroundColor: theme.canvas }}>
      <StatusBar style={theme.statusBar} />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingTop: insets.top + 20,
          paddingBottom: insets.bottom + 40,
          paddingHorizontal: 20,
          gap: 28,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ gap: 16 }}>
          <View style={{ gap: 8 }}>
            <Eyebrow>example</Eyebrow>
            <Display>Playground</Display>
            <Body>
              Tooltip, popover, and toast — one API, every platform.
            </Body>
          </View>
          {showSwitcher && onThemeChange ? (
            <ThemeSwitch value={themeName} onChange={onThemeChange} />
          ) : null}
        </View>
        <Gallery position={position} setPosition={setPosition} />
      </ScrollView>
      <ToastViewport position={position} />
    </View>
  );
};

export function Playground({
  lockedTheme,
}: {
  lockedTheme?: ThemeName;
} = {}) {
  const system = useColorScheme();
  const [themeName, setThemeName] = useState<ThemeName | null>(null);
  const name =
    lockedTheme ?? themeName ?? (system === "dark" ? "dark" : "light");

  return (
    <ThemeProvider name={name}>
      <Toast.Provider>
        <Shell
          themeName={name}
          onThemeChange={lockedTheme ? undefined : setThemeName}
          showSwitcher={!lockedTheme}
        />
      </Toast.Provider>
    </ThemeProvider>
  );
}
