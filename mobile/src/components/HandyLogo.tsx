import { View, Image, StyleSheet, ImageStyle, ViewStyle } from 'react-native';

interface HandyLogoProps {
  size?: number;
  showWordmark?: boolean;
  style?: ViewStyle;
}

/** Official Handy mascot + wordmark extracted from desktop brand assets. */
export function HandyLogo({ size = 96, showWordmark = true, style }: HandyLogoProps) {
  const gloveSize = showWordmark ? size * 0.72 : size;
  const wordmarkHeight = size * 0.42;
  const wordmarkWidth = wordmarkHeight * (930 / 328);

  return (
    <View style={[styles.row, style]}>
      <Image
        source={require('../../assets/handy-glove.png')}
        style={{ width: gloveSize, height: gloveSize } as ImageStyle}
        resizeMode="contain"
      />
      {showWordmark ? (
        <Image
          source={require('../../assets/handy-wordmark.png')}
          style={
            {
              width: wordmarkWidth,
              height: wordmarkHeight,
              marginLeft: 8,
            } as ImageStyle
          }
          resizeMode="contain"
        />
      ) : null}
    </View>
  );
}

export function HandyIcon({ size = 40 }: { size?: number }) {
  return (
    <Image
      source={require('../../assets/handy-glove.png')}
      style={{ width: size, height: size }}
      resizeMode="contain"
    />
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
