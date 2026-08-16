import { Platform } from "react-native";

// iOS Dynamic Island / Live Activity bridge for toasts. The visual template
// lives in the host app's widget extension (see the example's
// targets/toast-widget); this module only starts/updates/ends activities.
let nativeModule: any = null;
if (Platform.OS === "ios") {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { requireNativeModule } = require("expo-modules-core");
    nativeModule = requireNativeModule("ToastActivity");
  } catch {
    nativeModule = null;
  }
}

export type ToastActivityOptions = {
  title: string;
  description?: string;
};

/**
 * Whether Live Activities (Dynamic Island) can be presented right now.
 * Requires iOS 16.2+, `NSSupportsLiveActivities` in the app's Info.plist and
 * a widget extension declaring the toast activity template.
 */
export const isLiveActivitySupported = (): boolean => {
  try {
    return nativeModule?.isSupported() ?? false;
  } catch {
    return false;
  }
};

/**
 * Starts a toast Live Activity and returns its id, or null when unsupported.
 */
export const startToastActivity = async (
  options: ToastActivityOptions,
): Promise<string | null> => {
  if (!nativeModule) return null;
  return nativeModule.start(options.title, options.description ?? null);
};

export const updateToastActivity = async (
  id: string,
  options: ToastActivityOptions,
): Promise<void> => {
  await nativeModule?.update(id, options.title, options.description ?? null);
};

/**
 * Ends the activity with the given id, or every toast activity when omitted.
 */
export const endToastActivity = async (id?: string): Promise<void> => {
  await nativeModule?.end(id ?? null);
};
