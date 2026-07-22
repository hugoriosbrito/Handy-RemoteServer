import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Button, DeviceCard } from '@/components/ui';
import { colors, spacing, typography } from '@/theme/tokens';
import { useConnectionStore } from '@/stores/connectionStore';

export default function ComputersScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const computers = useConnectionStore((s) => s.computers);
  const removeComputer = useConnectionStore((s) => s.removeComputer);

  const formatLastSeen = (iso: string) => {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>

        <Text style={styles.title}>{t('computers.title')}</Text>

        {computers.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>{t('computers.empty')}</Text>
          </View>
        ) : (
          <FlatList
            data={computers}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <View>
                <DeviceCard
                  name={item.name}
                  subtitle={t('computers.lastSeen', {
                    date: formatLastSeen(item.lastSeen),
                  })}
                  isOnline={item.isOnline}
                />
                <TouchableOpacity
                  onPress={() => removeComputer(item.id)}
                  style={styles.removeBtn}
                >
                  <Text style={styles.removeText}>{t('computers.remove')}</Text>
                </TouchableOpacity>
              </View>
            )}
            contentContainerStyle={styles.list}
          />
        )}

        <Button
          title={t('computers.add')}
          onPress={() => router.push('/pair/scan')}
          style={styles.addBtn}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.backgroundAlt,
  },
  container: {
    flex: 1,
    paddingHorizontal: spacing.lg,
  },
  backBtn: {
    marginTop: spacing.sm,
    marginBottom: spacing.md,
    width: 40,
    height: 40,
    justifyContent: 'center',
  },
  title: {
    fontSize: typography.sizes.xxl,
    fontWeight: typography.weights.bold,
    color: colors.text,
    marginBottom: spacing.lg,
  },
  list: {
    paddingBottom: spacing.md,
  },
  removeBtn: {
    alignSelf: 'flex-end',
    marginBottom: spacing.md,
    marginTop: -spacing.sm,
  },
  removeText: {
    color: colors.error,
    fontSize: typography.sizes.sm,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    color: colors.midGray,
    fontSize: typography.sizes.md,
  },
  addBtn: {
    marginBottom: spacing.xl,
  },
});
