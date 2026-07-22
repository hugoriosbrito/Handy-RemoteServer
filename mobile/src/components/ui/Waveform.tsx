import { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import { colors, radius } from '@/theme/tokens';

interface WaveformProps {
  active?: boolean;
  barCount?: number;
  height?: number;
}

export function Waveform({ active = true, barCount = 24, height = 64 }: WaveformProps) {
  const anims = useRef(
    Array.from({ length: barCount }, () => new Animated.Value(0.3)),
  ).current;

  useEffect(() => {
    if (!active) {
      anims.forEach((a) => a.setValue(0.15));
      return;
    }

    const loops = anims.map((anim, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(anim, {
            toValue: 0.4 + Math.random() * 0.6,
            duration: 300 + i * 20,
            useNativeDriver: false,
          }),
          Animated.timing(anim, {
            toValue: 0.15 + Math.random() * 0.3,
            duration: 300 + i * 20,
            useNativeDriver: false,
          }),
        ]),
      ),
    );

    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [active, anims]);

  return (
    <View style={[styles.container, { height }]}>
      {anims.map((anim, i) => (
        <Animated.View
          key={i}
          style={[
            styles.bar,
            {
              height: anim.interpolate({
                inputRange: [0, 1],
                outputRange: [4, height],
              }),
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingHorizontal: 16,
  },
  bar: {
    width: 4,
    borderRadius: radius.sm,
    backgroundColor: colors.primary,
    opacity: 0.85,
  },
});
