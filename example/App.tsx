import "./src/input.css";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { Playground } from "./src/playground";

// poppo's toasts use react-native-gesture-handler for swipe-to-dismiss, which
// needs this at the root of the app on Android.
export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <Playground />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
