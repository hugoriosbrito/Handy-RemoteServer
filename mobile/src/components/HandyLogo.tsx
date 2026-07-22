import Svg, { Path, G, Circle } from 'react-native-svg';
import { colors } from '@/theme/tokens';

interface HandyLogoProps {
  size?: number;
  showText?: boolean;
}

export function HandyLogo({ size = 120, showText = true }: HandyLogoProps) {
  const handSize = showText ? size * 0.55 : size;
  const textWidth = size * 1.6;

  return (
    <Svg
      width={showText ? textWidth : handSize}
      height={size}
      viewBox={showText ? '0 0 200 80' : '0 0 80 80'}
    >
      <G>
        {/* Friendly glove / hand icon */}
        <Path
          d="M28 12 C28 8 32 4 38 4 C42 4 45 6 47 9 C48 6 51 4 55 4 C61 4 65 8 65 14 L65 38 C65 52 55 62 42 66 C29 62 19 52 19 38 L19 22 C19 16 23 12 28 12 Z"
          fill={colors.logoPrimary}
          stroke={colors.logoStroke}
          strokeWidth={2.5}
        />
        {/* Thumb */}
        <Path
          d="M19 28 C12 28 8 34 8 40 C8 46 12 50 19 50 L19 28 Z"
          fill={colors.logoPrimary}
          stroke={colors.logoStroke}
          strokeWidth={2.5}
        />
        {/* Smile */}
        <Path
          d="M32 42 Q42 50 52 42"
          fill="none"
          stroke={colors.logoStroke}
          strokeWidth={2}
          strokeLinecap="round"
        />
        {/* Eyes */}
        <Circle cx={34} cy={34} r={2} fill={colors.logoStroke} />
        <Circle cx={50} cy={34} r={2} fill={colors.logoStroke} />
      </G>
      {showText && (
        <G transform="translate(78, 18)">
          <Path
            d="M0 36 L0 4 L14 4 C22 4 28 10 28 18 C28 26 22 32 14 32 L8 32 L8 36 Z M8 12 L8 24 L14 24 C17 24 20 21 20 18 C20 15 17 12 14 12 Z"
            fill={colors.logoStroke}
          />
          <Path
            d="M34 36 L34 4 L48 4 C58 4 64 12 64 20 C64 28 58 36 48 36 Z M42 12 L42 28 L48 28 C53 28 56 25 56 20 C56 15 53 12 48 12 Z"
            fill={colors.logoStroke}
          />
          <Path
            d="M70 36 L70 4 L78 4 L78 24 L90 4 L100 4 L86 26 L100 36 L90 36 L78 18 L78 36 Z"
            fill={colors.logoStroke}
          />
          <Path
            d="M106 36 L106 4 L114 4 L114 28 L128 28 L128 36 Z"
            fill={colors.logoStroke}
          />
          <Path
            d="M134 36 L134 4 L148 4 C156 4 162 10 162 18 C162 26 156 32 148 32 L142 32 L142 36 Z M142 12 L142 24 L148 24 C151 24 154 21 154 18 C154 15 151 12 148 12 Z"
            fill={colors.logoStroke}
          />
        </G>
      )}
    </Svg>
  );
}

export function HandyIcon({ size = 48 }: { size?: number }) {
  return <HandyLogo size={size} showText={false} />;
}
