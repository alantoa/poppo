import "./src/input.css";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { Playground } from "./src/playground";

export default function App() {
  return (
    <SafeAreaProvider>
      <Playground />
    </SafeAreaProvider>
  );
}
