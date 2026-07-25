import { StyleSheet, Text, View, type ViewStyle } from "react-native";

export function RemoteCompanionBrand({
  compact = false,
  style,
}: {
  compact?: boolean;
  style?: ViewStyle;
}) {
  return (
    <View style={[styles.row, style]}>
      <View style={styles.mark}>
        <Text style={styles.markText}>RC</Text>
      </View>
      {!compact ? <Text style={styles.name}>Remote Companion</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  mark: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#da5893",
  },
  markText: { color: "#fff", fontSize: 14, fontWeight: "800" },
  name: { color: "#f4f1f3", fontSize: 20, fontWeight: "700" },
});
