import { useCallback, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
} from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Button } from "@/components/ui";
import {
  spacing,
  typography,
  radius,
  shadows,
  type ThemeColors,
} from "@/theme/tokens";
import { useTheme } from "@/theme/ThemeProvider";
import { useConnectionStore, type Computer } from "@/stores/connectionStore";
import { api } from "@/api/client";

export default function ComputersScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const computers = useConnectionStore((s) => s.computers);
  const computer = useConnectionStore((s) => s.computer);
  const token = useConnectionStore((s) => s.token);
  const baseUrl = useConnectionStore((s) => s.baseUrl);
  const removeComputer = useConnectionStore((s) => s.removeComputer);
  const addComputer = useConnectionStore((s) => s.addComputer);
  const disconnect = useConnectionStore((s) => s.disconnect);
  const colors = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const query = useQuery({
    queryKey: ["devices", token, baseUrl],
    enabled: Boolean(token),
    queryFn: async () => {
      if (!token) return [] as Computer[];
      const devices = await api.listDevices(token, baseUrl ?? undefined);
      return devices.map(
        (d): Computer => ({
          id: d.id,
          name: d.name,
          lastSeen: d.lastSeenAt
            ? new Date(
                Number(d.lastSeenAt) * 1000 || Date.parse(d.lastSeenAt),
              ).toISOString()
            : new Date().toISOString(),
          isOnline: true,
        }),
      );
    },
  });

  const list = query.data?.length ? query.data : computers;

  const onRefresh = useCallback(() => {
    void query.refetch();
  }, [query]);

  const handleRemove = async (id: string) => {
    if (token) {
      try {
        await api.revokeDevice(token, id, baseUrl ?? undefined);
      } catch {
        // still remove locally
      }
    }
    removeComputer(id);
    if (computer?.id === id) {
      await disconnect();
    }
  };

  const formatLastSeen = (iso: string) =>
    new Date(iso).toLocaleString(undefined, {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back()}
          accessibilityLabel={t("common.back")}
          accessibilityRole="button"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="chevron-back" size={28} color={colors.text} />
        </TouchableOpacity>

        <Text style={styles.title}>{t("computers.title")}</Text>

        {list.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>{t("computers.empty")}</Text>
          </View>
        ) : (
          <FlatList
            data={list}
            keyExtractor={(item) => item.id}
            refreshControl={
              <RefreshControl
                refreshing={query.isFetching}
                onRefresh={onRefresh}
              />
            }
            renderItem={({ item }) => {
              const isActive = computer?.id === item.id;
              return (
                <View style={styles.card}>
                  <View style={styles.cardRow}>
                    <View style={styles.icon}>
                      <Ionicons
                        name="desktop-outline"
                        size={24}
                        color={colors.primary}
                      />
                    </View>
                    <View style={styles.info}>
                      <Text style={styles.name}>{item.name}</Text>
                      <Text style={styles.meta}>
                        {item.isOnline
                          ? t("computers.onlineLocal")
                          : t("computers.offlineTailscale")}
                      </Text>
                      <Text style={styles.seen}>
                        {t("computers.lastSeen", {
                          date: formatLastSeen(item.lastSeen),
                        })}
                      </Text>
                    </View>
                    <Ionicons
                      name={isActive ? "star" : "star-outline"}
                      size={22}
                      color={isActive ? colors.primary : colors.midGray}
                    />
                  </View>
                  <TouchableOpacity
                    onPress={() => void handleRemove(item.id)}
                    style={styles.removeBtn}
                  >
                    <Text style={styles.removeText}>
                      {t("computers.remove")}
                    </Text>
                  </TouchableOpacity>
                </View>
              );
            }}
            contentContainerStyle={styles.list}
          />
        )}

        <Button
          title={t("computers.add")}
          onPress={() => {
            if (computer) addComputer(computer);
            router.push("/pair/scan");
          }}
          style={styles.addBtn}
        />
      </View>
    </SafeAreaView>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.backgroundAlt },
    container: { flex: 1, paddingHorizontal: spacing.lg },
    backBtn: {
      marginTop: spacing.sm,
      marginBottom: spacing.md,
      width: 40,
      height: 40,
      justifyContent: "center",
    },
    title: {
      fontSize: typography.sizes.xxl,
      fontWeight: typography.weights.bold,
      color: colors.text,
      marginBottom: spacing.lg,
    },
    list: { paddingBottom: spacing.md },
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      padding: spacing.md,
      marginBottom: spacing.sm,
      ...shadows.card,
    },
    cardRow: { flexDirection: "row", alignItems: "center" },
    icon: {
      width: 48,
      height: 48,
      borderRadius: radius.md,
      backgroundColor: colors.codeBg,
      alignItems: "center",
      justifyContent: "center",
      marginRight: spacing.md,
    },
    info: { flex: 1 },
    name: {
      fontSize: typography.sizes.md,
      fontWeight: typography.weights.semibold,
      color: colors.text,
    },
    meta: {
      marginTop: 2,
      fontSize: typography.sizes.sm,
      color: colors.success,
    },
    seen: {
      marginTop: 2,
      fontSize: typography.sizes.xs,
      color: colors.midGray,
    },
    removeBtn: { alignSelf: "flex-end", marginTop: spacing.sm },
    removeText: { color: colors.error, fontSize: typography.sizes.sm },
    empty: { flex: 1, alignItems: "center", justifyContent: "center" },
    emptyText: { color: colors.midGray, fontSize: typography.sizes.md },
    addBtn: { marginBottom: spacing.xl },
  });
