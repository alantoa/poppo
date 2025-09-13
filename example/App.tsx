import {
  Text,
  View,
  Image,
  ScrollView,
  Platform,
  StyleSheet,
} from "react-native";

import { CreateTooltip } from "./src/create-tooltip";

export default function App() {
  return (
    <ScrollView>
      <View style={styles.blackContainer}>
        <View style={styles.contentContainer}>
          <View style={styles.rowWrap}>
            <View style={styles.absLeft20TopNeg2}>
              <CreateTooltip
                title="Long text tooltip"
                text="A very long long long long long text tooltip"
                side="top"
                disableDismissWhenTouchOutside
                maxWidth={200}
              />
            </View>
            <View style={styles.absLeft0Top12}>
              <CreateTooltip text="Show in right" side="right" />
            </View>
            <View style={styles.absRight8}>
              <CreateTooltip text="Show in left" side="left" />
            </View>
            <View style={styles.absLeft4Top32}>
              <CreateTooltip text="Show in top" side="top" />
            </View>
            <View style={styles.absLeft36Top28}>
              <CreateTooltip
                text="Custom view"
                backgroundColor="rgba(31,41,55,1)"
                onTap={() => {
                  // Does not work on android
                  console.log("onTapProfile!");
                }}
                customView={
                  <View style={styles.customView}>
                    <Image
                      source={{
                        uri: "https://pbs.twimg.com/profile_images/1507747390790377479/F9abCIUR_400x400.jpg",
                      }}
                      style={styles.avatarImg}
                    />
                    <View style={styles.followPill}>
                      <Text
                        onPress={() => {
                          // This does not work on native because the onPress event is missing on the super view.
                        }}
                        style={styles.followText}
                      >
                        Follow
                      </Text>
                    </View>
                    <View style={styles.infoContainer}>
                      <Text style={styles.nameText}>Alan</Text>
                      <Text style={styles.handleText}>@alantoa</Text>
                      <Text style={styles.bioText}>
                        software engineer https://github.com/alantoa
                      </Text>
                    </View>
                  </View>
                }
                side="bottom"
              >
                <View style={styles.avatarBorder}>
                  <Image
                    source={{
                      uri: "https://pbs.twimg.com/profile_images/1507747390790377479/F9abCIUR_400x400.jpg",
                    }}
                    style={styles.avatarImg}
                  />
                  <View style={styles.indicator} />
                </View>
              </CreateTooltip>
            </View>
            <View style={styles.absRight0Top28}>
              <CreateTooltip text="Show in bottom" side="bottom" />
            </View>
            <View style={styles.absLeft20Top48}>
              <CreateTooltip
                text="Zoom in"
                side="bottom"
                presetAnimation="zoomIn"
              />
            </View>
            <View style={styles.absLeft56Top56}>
              <CreateTooltip text="None" side="bottom" presetAnimation="none" />
            </View>
            {Platform.OS !== "web" && (
              <View style={styles.absTop96}>
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

const styles = StyleSheet.create({
  blackContainer: {
    backgroundColor: "#000000",
    alignItems: "center",
    justifyContent: "center",
    height: 1000,
  },
  contentContainer: {
    flex: 1,
    paddingHorizontal: 16,
    maxWidth: 448,
    width: "100%",
  },
  rowWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 112,
  },
  absLeft20TopNeg2: {
    position: "absolute",
    left: 80,
    top: -8,
  },
  absLeft0Top12: {
    position: "absolute",
    left: 0,
    top: 48,
  },
  absRight8: {
    position: "absolute",
    right: 32,
  },
  absLeft4Top32: {
    position: "absolute",
    left: 16,
    top: 128,
  },
  absLeft36Top28: {
    position: "absolute",
    left: 144,
    top: 112,
  },
  customView: {
    backgroundColor: "#1f2937",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 8,
    width: 224,
    height: 160,
  },
  avatarImg: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  followPill: {
    position: "absolute",
    right: 8,
    top: 8,
    backgroundColor: "#f3f4f6",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 9999,
  },
  followText: {
    color: "#111827",
    fontWeight: "700",
    fontSize: 12,
  },
  infoContainer: {
    paddingHorizontal: 8,
    marginTop: 4,
  },
  nameText: {
    color: "#f3f4f6",
    fontWeight: "700",
    fontSize: 14,
  },
  handleText: {
    color: "#9ca3af",
    fontWeight: "700",
    fontSize: 12,
  },
  bioText: {
    color: "#f3f4f6",
    fontWeight: "700",
    fontSize: 16,
    marginTop: 8,
  },
  avatarBorder: {
    borderWidth: 1,
    borderColor: "#4b5563",
    borderRadius: 9999,
  },
  indicator: {
    position: "absolute",
    right: 0,
    backgroundColor: "#f3f4f6",
    paddingHorizontal: 4,
    paddingVertical: 4,
    top: -4,
    borderRadius: 9999,
  },
  absRight0Top28: {
    position: "absolute",
    right: 0,
    top: 112,
  },
  absLeft20Top48: {
    position: "absolute",
    left: 80,
    top: 192,
  },
  absLeft56Top56: {
    position: "absolute",
    left: 224,
    top: 224,
  },
  absTop96: {
    position: "absolute",
    top: 384,
  },
});
