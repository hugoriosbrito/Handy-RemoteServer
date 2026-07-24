import { useEffect, useMemo, useRef, useState } from "react";
import { View, StyleSheet, Animated, AccessibilityInfo } from "react-native";
import { radius, type ThemeColors } from "@/theme/tokens";
import { useTheme } from "@/theme/ThemeProvider";

interface WaveformProps {
  active?: boolean;
  amplitude?: number;
  barCount?: number;
  height?: number;
}

export function Waveform({
  active = true,
  amplitude,
  barCount = 24,
  height = 64,
}: WaveformProps) {
  const colors = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [reduceMotion, setReduceMotion] = useState(false);
  const anims = useRef(
    Array.from({ length: barCount }, () => new Animated.Value(0.3)),
  ).current;

  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => {
      if (!cancelled) setReduceMotion(v);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!active) {
      anims.forEach((a) => a.setValue(0.1));
      return;
    }

    if (reduceMotion) {
      const base = amplitude ?? 0.5;
      anims.forEach((a, i) => {
        const shape = 0.2 + 0.8 * Math.abs(Math.sin((i / barCount) * Math.PI));
        a.setValue(Math.max(0.1, base * shape));
      });
      return;
    }

    if (amplitude !== undefined) {
      const loops = anims.map((anim, i) => {
        const target = Math.max(
          0.15,
          amplitude *
            (0.25 + 0.75 * Math.abs(Math.sin((i / barCount) * Math.PI))),
        );
        return Animated.loop(
          Animated.sequence([
            Animated.timing(anim, {
              toValue: target * 0.6,
              duration: 120 + i * 10,
              useNativeDriver: false,
            }),
            Animated.timing(anim, {
              toValue: target,
              duration: 120 + i * 10,
              useNativeDriver: false,
            }),
          ]),
        );
      });
      loops.forEach((l) => l.start());
      return () => loops.forEach((l) => l.stop());
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
  }, [active, amplitude, anims, barCount, reduceMotion]);

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

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 4,
      paddingHorizontal: 16,
    },
    bar: {
      width: 3,
      borderRadius: radius.sm,
      backgroundColor: colors.primary,
      opacity: 0.95,
    },
  });
