import { View, Text, StyleSheet } from 'react-native';
import Svg, { Path, G, Circle } from 'react-native-svg';
import { colors, typography } from '@/theme/tokens';

interface HandyLogoProps {
  size?: number;
  showText?: boolean;
}

export function HandyLogo({ size = 120, showText = true }: HandyLogoProps) {
  const handSize = showText ? size * 0.55 : size;

  return (
    <View style={styles.row}>
      <Svg width={handSize} height={handSize} viewBox="0 0 80 80">
        <G>
          <Path
            d="M28 12 C28 8 32 4 38 4 C42 4 45 6 47 9 C48 6 51 4 55 4 C61 4 65 8 65 14 L65 38 C65 52 55 62 42 66 C29 62 19 52 19 38 L19 22 C19 16 23 12 28 12 Z"
            fill={colors.logoPrimary}
            stroke={colors.logoStroke}
            strokeWidth={2.5}
          />
          <Path
            d="M19 28 C12 28 8 34 8 40 C8 46 12 50 19 50 L19 28 Z"
            fill={colors.logoPrimary}
            stroke={colors.logoStroke}
            strokeWidth={2.5}
          />
          <Path
            d="M32 42 Q42 50 52 42"
            fill="none"
            stroke={colors.logoStroke}
            strokeWidth={2}
            strokeLinecap="round"
          />
          <Circle cx={34} cy={34} r={2} fill={colors.logoStroke} />
          <Circle cx={50} cy={34} r={2} fill={colors.logoStroke} />
        </G>
      </Svg>
      {showText ? (
        <Text style={[styles.wordmark, { fontSize: size * 0.32 }]}>Handy</Text>
      ) : null}
    </View>
  );
}

export function HandyIcon({ size = 48 }: { size?: number }) {
  return <HandyLogo size={size} showText={false} />;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  wordmark: {
    fontWeight: typography.weights.bold,
    color: colors.logoStroke,
    letterSpacing: 0.5,
  },
});
