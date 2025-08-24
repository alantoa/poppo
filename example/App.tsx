import "./global.css";

import { Text, View, StatusBar } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { BottomTabbar } from "./src/navigation/bottom-tab-bar";
import {
  TabBarHomeIcon,
  TabBarLikeIcon,
  TabBarProfileIcon,
  TabBarSearchIcon,
} from "./src/navigation/tab-bar-icon";
import { HomeScreen } from "./src/home";
import { LikeScreen } from "./src/like";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { ModalScreen } from "./src/modal";
import { NormalScreen } from "./src/screen";

StatusBar.setBarStyle("light-content");
StatusBar.setHidden(true);
const Tab = createBottomTabNavigator();

function SearchScreen() {
  return (
    <View className="flex-1 items-center justify-center bg-black">
      <Text className="text-white">SearchScreen!</Text>
    </View>
  );
}

function ProfileScreen() {
  return (
    <View className="flex-1 items-center justify-center bg-black">
      <Text className="text-white">ProfileScreen!</Text>
    </View>
  );
}
const Stack = createNativeStackNavigator();
function BottomTabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerBackgroundContainerStyle: {
          backgroundColor: "#000",
        },
        headerBackground: () => {
          return null;
        },
        headerTintColor: "#fff",
      }}
      tabBar={(props) => <BottomTabbar {...props} />}
    >
      <Tab.Screen
        name="Tooltip Example"
        options={{
          tabBarIcon: TabBarHomeIcon,
        }}
        component={HomeScreen}
      />
      <Tab.Screen
        name="Search"
        options={{
          tabBarIcon: TabBarSearchIcon,
        }}
        component={SearchScreen}
      />
      <Tab.Screen
        name="Like"
        options={{
          tabBarIcon: TabBarLikeIcon,
        }}
        component={LikeScreen}
      />

      <Tab.Screen
        name="Profile"
        options={{
          tabBarIcon: TabBarProfileIcon,
        }}
        component={ProfileScreen}
      />
    </Tab.Navigator>
  );
}

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator>
        <Stack.Screen
          name="bottomTabs"
          options={{ headerShown: false }}
          component={BottomTabNavigator}
        />
        <Stack.Group
          screenOptions={{
            headerShown: false,
            animation: "default",
            // presentation: "formSheet",
            presentation: "modal",
          }}
        >
          <Stack.Screen name="modal" component={ModalScreen} />
        </Stack.Group>
        <Stack.Group
          screenOptions={{
            fullScreenGestureEnabled: true,
          }}
        >
          <Stack.Screen name="normalScreen" component={NormalScreen} />
        </Stack.Group>
      </Stack.Navigator>
    </NavigationContainer>
  );
}
