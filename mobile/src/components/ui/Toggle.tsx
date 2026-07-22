import { Switch, View, Text, StyleSheet } from 'react-native';
import { colors, typography, spacing } from '@/theme/tokens';

interface ToggleProps {
  value: boolean;
  onValueChange: (v: boolean) => void;
  label: string;
  hint?: string;
}

export function Toggle({ value, onValueChange, label, hint }: ToggleProps) {
  return (
    <View style={styles.container}>
      <View style={styles.textCol}>
        <Text style={styles.label}>{label}</Text>
        {hint && <Text style={styles.hint}>{hint}</Text>}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: colors.border, true: colors.logoPrimary }}
        thumbColor={value ? colors.primary : colors.white}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
  },
  textCol: {
    flex: 1,
    marginRight: spacing.md,
  },
  label: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.medium,
    color: colors.text,
  },
  hint: {
    fontSize: typography.sizes.sm,
    color: colors.midGray,
    marginTop: spacing.xs,
  },
});
