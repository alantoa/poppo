import Ionicons from "@expo/vector-icons/Ionicons";
import { StatusBar } from "expo-status-bar";
import { useRef, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  Text,
  useColorScheme,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Popover, Toast, Tooltip, useToastManager } from "poppo";
import type {
  Side,
  ToastObject,
  ToastOverflow,
  ToastViewportPosition,
  ToastViewportPresentation,
} from "poppo";

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

const PRESENTATIONS: {
  value: ToastViewportPresentation;
  label: string;
}[] = [
  { value: "inline", label: "Inline" },
  { value: "window", label: "Window" },
];

const OVERFLOWS: { value: ToastOverflow; label: string }[] = [
  { value: "queue", label: "Queue" },
  { value: "replace", label: "Replace" },
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
      <Hint.Trigger
        delay={150}
        testID="demo-tooltip-rich"
        accessibilityLabel="Show rich tooltip"
      >
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
            <Hint.Arrow width={14} height={8} backgroundColor={theme.bubble} />
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
      <Popover.Trigger
        testID="demo-popover-confirm"
        accessibilityLabel="Open confirm popover"
      >
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

/**
 * The reason `presentation="window"` exists. A React Native `Modal` presents a
 * view controller of its own, so an inline viewport is painted underneath it;
 * a window overlay is not.
 */
const ModalToast = () => {
  const theme = useTheme();
  const toast = useToastManager();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        testID="demo-toast-modal-open"
        label="Open"
        onPress={() => setOpen(true)}
      />
      <Modal
        visible={open}
        animationType="slide"
        onRequestClose={() => setOpen(false)}
        transparent
      >
        <View
          style={{
            flex: 1,
            backgroundColor: theme.canvas,
            alignItems: "center",
            justifyContent: "center",
            gap: 16,
            padding: 24,
          }}
        >
          <Text style={{ color: theme.ink, fontSize: 17, fontWeight: "500" }}>
            Inside a Modal
          </Text>
          <Text
            style={{
              color: theme.body,
              fontSize: 13,
              lineHeight: 19,
              textAlign: "center",
            }}
          >
            With presentation=&quot;window&quot; the toast shows on top of this
            screen. With &quot;inline&quot; it is raised behind it.
          </Text>
          <Button
            testID="demo-toast-modal-raise"
            label="Show toast"
            onPress={() =>
              toast.add({
                id: "in-modal",
                title: "Raised from a Modal",
                description: "Above it, if the viewport owns a window",
              })
            }
          />
          <Button
            testID="demo-toast-modal-close"
            label="Close"
            onPress={() => setOpen(false)}
          />
        </View>
        {/* On Android a Modal is a Dialog with a window of its own, so the
            viewport at the root of the app cannot be drawn over it. A second
            viewport in here takes over while the modal is open. */}
        <ToastViewport position="bottom" presentation="inline" />
      </Modal>
    </>
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
      <Ionicons name="checkmark-circle" size={18} color={theme.success} />
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

const ToastViewport = ({
  position,
  presentation,
}: {
  position: ToastViewportPosition;
  presentation: ToastViewportPresentation;
}) => {
  const { toasts } = useToastManager();
  const insets = useSafeAreaInsets();
  return (
    <Toast.Viewport
      position={position}
      presentation={presentation}
      insets={insets}
      expandable
    >
      {toasts.map((toast) => (
        <DemoToast key={toast.id} toast={toast} />
      ))}
    </Toast.Viewport>
  );
};

const Gallery = ({
  position,
  setPosition,
  overflow,
  setOverflow,
  presentation,
  setPresentation,
}: {
  position: ToastViewportPosition;
  setPosition: (next: ToastViewportPosition) => void;
  overflow: ToastOverflow;
  setOverflow: (next: ToastOverflow) => void;
  presentation: ToastViewportPresentation;
  setPresentation: (next: ToastViewportPresentation) => void;
}) => {
  const toast = useToastManager();
  const burst = useRef(0);

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
        hint="Same id refreshes. Tap a stack to open it. Holding pauses."
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
        <Row label="Deep stack" subtitle="One press, five sticky toasts">
          <Button
            testID="demo-toast-stack"
            label="Show"
            onPress={() => {
              // timeout 0 keeps them up: a demoted toast is only shortened if
              // it had a countdown at all, so the stack stays for inspection.
              for (let i = 1; i <= 5; i += 1) {
                toast.add({
                  id: `stacked-${i}`,
                  title: `Stacked ${i}`,
                  description: i === 5 ? "Newest, in front" : undefined,
                  timeout: 0,
                  data: { dismissible: true },
                });
              }
            }}
          />
        </Row>
        <Row label="New id each tap" subtitle={`overflow: "${overflow}"`}>
          <Button
            testID="demo-toast-burst"
            label="Show"
            onPress={() => {
              const n = ++burst.current;
              toast.add({ title: `Message ${n}`, timeout: 3000 });
            }}
          />
        </Row>
        <Row label="Overflow" subtitle="Switching clears the toasts" stack>
          <Segmented
            options={OVERFLOWS}
            value={overflow}
            onChange={setOverflow}
          />
        </Row>
        <Row label="From a Modal" subtitle='Needs presentation="window"'>
          <ModalToast />
        </Row>
        <Row label="Presentation" subtitle="iOS only; window beats Modal" stack>
          <Segmented
            options={PRESENTATIONS}
            value={presentation}
            onChange={setPresentation}
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
  overflow,
  setOverflow,
}: {
  themeName: ThemeName;
  onThemeChange?: (next: ThemeName) => void;
  showSwitcher: boolean;
  overflow: ToastOverflow;
  setOverflow: (next: ToastOverflow) => void;
}) => {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [position, setPosition] = useState<ToastViewportPosition>("bottom");
  const [presentation, setPresentation] =
    useState<ToastViewportPresentation>("window");

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
            <Body>Tooltip, popover, and toast — one API, every platform.</Body>
          </View>
          {showSwitcher && onThemeChange ? (
            <ThemeSwitch value={themeName} onChange={onThemeChange} />
          ) : null}
        </View>
        <Gallery
          position={position}
          setPosition={setPosition}
          overflow={overflow}
          setOverflow={setOverflow}
          presentation={presentation}
          setPresentation={setPresentation}
        />
      </ScrollView>
      <ToastViewport position={position} presentation={presentation} />
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
  const [overflow, setOverflow] = useState<ToastOverflow>("queue");
  const name =
    lockedTheme ?? themeName ?? (system === "dark" ? "dark" : "light");

  return (
    <ThemeProvider name={name}>
      {/* The manager is created once per Provider, so changing `overflow`
          remounts it — and drops whatever toasts were up. */}
      <Toast.Provider key={overflow} overflow={overflow}>
        <Shell
          themeName={name}
          onThemeChange={lockedTheme ? undefined : setThemeName}
          showSwitcher={!lockedTheme}
          overflow={overflow}
          setOverflow={setOverflow}
        />
      </Toast.Provider>
    </ThemeProvider>
  );
}
