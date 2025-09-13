import { useState } from "react";
import {
  Text,
  View,
  Platform,
  ViewProps,
  TouchableHighlight,
} from "react-native";
import * as Tooltip from "universal-tooltip";
import type { ContentProps } from "universal-tooltip";

const TriggerView = Platform.OS === "web" ? View : (TouchableHighlight as any);

export const CreateTooltip = ({
  side = "top",
  text,
  backgroundColor = "#fff",
  customView,
  disableDismissWhenTouchOutside,
  children,
  title,
  ...rest
}: ViewProps &
  ContentProps & {
    text: string;
    customView?: JSX.Element;
    disableDismissWhenTouchOutside?: boolean;
  }) => {
  const [open, setOpen] = useState(false);
  return (
    <Tooltip.Root
      {...Platform.select({
        web: {},
        default: {
          open,
          onDismiss: () => {
            setOpen(false);
          },
        },
      })}
      usePopover={isMobileWeb()}
      delayDuration={300}
      disableDismissWhenTouchOutside={disableDismissWhenTouchOutside}
    >
      <Tooltip.Trigger>
        <TriggerView
          {...Platform.select({
            web: { open: true },
            default: {
              open,
              onPress: () => {
                setOpen(true);
              },
            },
          })}
        >
          {children ? (
            children
          ) : (
            <View
              style={{
                backgroundColor: "black",
                borderColor: "#gray-100",
                justifyContent: "center",
                alignItems: "center",
                borderRadius: 4,
                paddingHorizontal: 2,
                cursor: "pointer",
              }}
            >
              <Text style={{ fontSize: 12, color: "white" }}>
                {title ?? text}
              </Text>
            </View>
          )}
        </TriggerView>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          sideOffset={3}
          containerStyle={{
            paddingLeft: 10,
            paddingRight: 10,
            paddingTop: 10,
            paddingBottom: 10,
          }}
          onTap={() => {
            setOpen(false);
            console.log("onTap");
          }}
          dismissDuration={500}
          disableTapToDismiss
          side={side}
          presetAnimation="fadeIn"
          backgroundColor={backgroundColor}
          borderRadius={12}
          {...rest}
        >
          {customView ? (
            customView
          ) : (
            <Tooltip.Text
              text={text}
              style={{
                fontSize: 14,
                fontWeight: "bold",
                color: "#020202",
              }}
            />
          )}
          <Tooltip.Arrow
            width={10}
            height={5}
            backgroundColor={backgroundColor}
          />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
};

export function isAndroid(): boolean {
  return (
    typeof navigator !== "undefined" && /android/i.test(navigator.userAgent)
  );
}

export function isSmallIOS(): boolean {
  return (
    typeof navigator !== "undefined" && /iPhone|iPod/.test(navigator.userAgent)
  );
}

export function isLargeIOS(): boolean {
  return typeof navigator !== "undefined" && /iPad/.test(navigator.userAgent);
}

export function isIOS(): boolean {
  return isSmallIOS() || isLargeIOS();
}
export function isSafari(): boolean {
  return (
    typeof navigator !== "undefined" &&
    /Safari/.test(navigator.userAgent) &&
    !/Chrome/.test(navigator.userAgent)
  );
}

export function isMobileWeb(): boolean {
  return Platform.OS === "web" && (isAndroid() || isIOS());
}
export function isDesktopWeb(): boolean {
  return Platform.OS === "web" && !isAndroid() && !isIOS();
}
