
import {
  Text,
  View,
  Image,
  ScrollView,
  Platform,
  Pressable,
} from "react-native";

import { CreateTooltip } from "./create-tooltip";

export function HomeScreen() {
  return (
    <ScrollView>
      <View
        className="bg-black items-center justify-center"
        style={{ height: 1000 }}
      >
        <View className="flex-1 px-4 max-w-md w-full">
          <View className="flex-row flex-wrap mt-28">
            <View className="absolute left-20 -top-2">
              <CreateTooltip
                title="Long text tooltip"
                text="A very long long long long long text tooltip"
                side="top"
                disableDismissWhenTouchOutside
                maxWidth={200}
              />
            </View>
            <View className="absolute left-0 top-12">
              <CreateTooltip text="Show in right" side="right" />
            </View>
            <View className="absolute right-8">
              <CreateTooltip text="Show in left" side="left" />
            </View>
            <View className="absolute left-4 top-32">
              <CreateTooltip text="Show in top" side="top" />
            </View>
            <View className="absolute left-36 top-28">
              <CreateTooltip
                text="Custom view"
                backgroundColor="rgba(31,41,55,1)"
                onTap={() => {
                  // Does not work on android
                  console.log("onTapProfile!");
                }}
                customView={
                  <View className="bg-gray-800 rounded-md px-2 py-2 w-56 h-40">
                    <Image
                      source={{
                        uri: "https://pbs.twimg.com/profile_images/1507747390790377479/F9abCIUR_400x400.jpg",
                      }}
                      className="w-12 h-12 rounded-full"
                    />
                    <View className="absolute right-2 bg-gray-100 px-4 py-2 top-2 rounded-full">
                      <Text
                        onPress={() => {
                          // This does not work on native because the onPress event is missing on the super view.
                        }}
                        className="text-gray-900 font-bold text-xs"
                      >
                        Follow
                      </Text>
                    </View>
                    <View className="px-2 mt-1">
                      <Text className="text-gray-100 font-bold text-sm">
                        Alan
                      </Text>
                      <Text className="text-gray-400 font-bold text-xs">
                        @alantoa
                      </Text>
                      <Text className="text-gray-100 font-bold text-md mt-2">
                        software engineer https://github.com/alantoa
                      </Text>
                    </View>
                  </View>
                }
                side="bottom"
              >
                <View className="border border-gray-600 rounded-full">
                  <Image
                    source={{
                      uri: "https://pbs.twimg.com/profile_images/1507747390790377479/F9abCIUR_400x400.jpg",
                    }}
                    className="w-12 h-12 rounded-full"
                  />
                  <View className="absolute -right-0 bg-gray-100 px-1 py-1 -top-1 rounded-full" />
                </View>
              </CreateTooltip>
            </View>
            <View className="absolute right-0 top-28">
              <CreateTooltip text="Show in bottom" side="bottom" />
            </View>
            <View className="absolute left-20 top-48">
              <CreateTooltip
                text="Zoom in"
                side="bottom"
                presetAnimation="zoomIn"
              />
            </View>
            <View className="absolute left-56 top-56">
              <CreateTooltip text="None" side="bottom" presetAnimation="none" />
            </View>
            {Platform.OS != "web" && (
              <View className="absolute top-96">
                <CreateTooltip
                  text="disableDismissWhenTouchOutside: ture"
                  disableDismissWhenTouchOutside
                  side="bottom"
                  presetAnimation="none"
                />
              </View>
            )}
          </View>
        </View>
      </View>
    </ScrollView>
  );
}
