import { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { theme } from "@/lib/theme";
import type { DeckCardDef, DeckSide } from "@/lib/onboardingScript";

interface Props {
  visible: boolean;
  title: string;
  cards: DeckCardDef[];
  onAnswer: (key: string, value: string | number) => void;
  onSkip: (key: string) => void;
  onComplete: () => void;
}

// Full-screen slide-up panel of draggable this-or-that cards -- the
// "rapid fire" sections of the matchmaker onboarding. Drag left = side A,
// right = side B; the poles are also tappable, and scales get a centered
// "somewhere in between" pill. Same Animated + PanResponder stack as
// components/SwipeCard.tsx.
export function RapidFireDeck({ visible, title, cards, onAnswer, onSkip, onComplete }: Props) {
  const { width: rawWidth, height: rawHeight } = useWindowDimensions();
  const screenWidth = rawWidth || 320;
  const screenHeight = rawHeight || 640;
  const threshold = Math.max(screenWidth * 0.24, 20);

  const [index, setIndex] = useState(0);
  const indexRef = useRef(0);
  const [stat, setStat] = useState<string | null>(null);
  const [committedSide, setCommittedSide] = useState<"a" | "b" | null>(null);
  const committedRef = useRef(false);

  const slide = useRef(new Animated.Value(screenHeight)).current;
  const position = useRef(new Animated.ValueXY()).current;
  const fade = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (visible) {
      indexRef.current = 0;
      setIndex(0);
      setStat(null);
      setCommittedSide(null);
      committedRef.current = false;
      position.setValue({ x: 0, y: 0 });
      fade.setValue(1);
    }
    Animated.timing(slide, {
      toValue: visible ? 0 : screenHeight,
      duration: 420,
      useNativeDriver: false,
    }).start();
  }, [visible, screenHeight, slide, position, fade]);

  const card = cards[index];
  const next = cards[index + 1];

  // Rebuilt per card: PanResponder callbacks close over commit()/card, which
  // change with the index (unlike SwipeCard, where each card is its own
  // component instance).
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => !committedRef.current && Math.abs(g.dx) > 6,
        onPanResponderMove: (_, g) => {
          if (committedRef.current) return;
          position.setValue({ x: g.dx, y: g.dy * 0.15 });
        },
        onPanResponderRelease: (_, g) => {
          if (committedRef.current) return;
          if (g.dx < -threshold) commit("a");
          else if (g.dx > threshold) commit("b");
          else Animated.spring(position, { toValue: { x: 0, y: 0 }, useNativeDriver: false }).start();
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [index, cards, threshold, screenWidth]
  );

  function advance() {
    setTimeout(() => {
      // NOT inside the setIndex updater: updaters must stay pure, and
      // onComplete() sets parent state.
      if (indexRef.current + 1 >= cards.length) {
        onComplete();
        return;
      }
      indexRef.current += 1;
      setStat(null);
      setCommittedSide(null);
      committedRef.current = false;
      position.setValue({ x: 0, y: 0 });
      fade.setValue(1);
      setIndex(indexRef.current);
    }, 1350);
  }

  function commit(side: "a" | "b") {
    if (committedRef.current) return;
    committedRef.current = true;
    setCommittedSide(side);
    const chosen: DeckSide = side === "a" ? card.a : card.b;
    onAnswer(card.key, chosen.value);
    setStat(chosen.stat ?? null);

    const off = side === "a" ? -screenWidth * 1.5 : screenWidth * 1.5;
    setTimeout(() => {
      Animated.timing(position, {
        toValue: { x: off, y: -30 },
        duration: 300,
        useNativeDriver: false,
      }).start();
    }, 240);
    advance();
  }

  function commitMid() {
    if (committedRef.current || !card.mid) return;
    committedRef.current = true;
    onAnswer(card.key, card.mid.value);
    setStat(card.mid.stat ?? null);
    Animated.timing(fade, { toValue: 0, duration: 300, useNativeDriver: false }).start();
    advance();
  }

  function skip() {
    if (committedRef.current) return;
    committedRef.current = true;
    onSkip(card.key);
    setStat("Skipped. No penalty — promise.");
    Animated.timing(fade, { toValue: 0, duration: 300, useNativeDriver: false }).start();
    advance();
  }

  const rotate = position.x.interpolate({
    inputRange: [-screenWidth / 2, 0, screenWidth / 2],
    outputRange: ["-8deg", "0deg", "8deg"],
  });
  const dimWhenLeanB = position.x.interpolate({
    inputRange: [0, threshold],
    outputRange: [1, 0.3],
    extrapolate: "clamp",
  });
  const dimWhenLeanA = position.x.interpolate({
    inputRange: [-threshold, 0],
    outputRange: [0.3, 1],
    extrapolate: "clamp",
  });
  const notedLeft = position.x.interpolate({
    inputRange: [-threshold, -12],
    outputRange: [1, 0],
    extrapolate: "clamp",
  });
  const notedRight = position.x.interpolate({
    inputRange: [12, threshold],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });

  if (!card) return null;

  return (
    <Animated.View style={[styles.panel, { transform: [{ translateY: slide }] }]} pointerEvents={visible ? "auto" : "none"}>
      <View style={styles.head}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.count}>
          {index + 1} / {cards.length}
        </Text>
      </View>

      <View style={styles.stage}>
        {next && (
          <View style={[styles.card, styles.cardBehind]}>
            <Text style={styles.kicker}>{next.kicker}</Text>
          </View>
        )}

        <Animated.View
          key={`${card.key}-${index}`}
          style={[styles.card, { opacity: fade, transform: [{ translateX: position.x }, { translateY: position.y }, { rotate }] }]}
          {...panResponder.panHandlers}
        >
          <Text style={styles.kicker}>{card.kicker}</Text>

          <Pressable onPress={() => commit("a")} style={styles.optA} disabled={committedSide !== null}>
            <Animated.Text style={[styles.optText, { opacity: committedSide === "b" ? 0.3 : dimWhenLeanA }]}>
              {card.a.label}
              <Text style={styles.dir}>{"\n"}← swipe left</Text>
            </Animated.Text>
          </Pressable>

          <Text style={styles.or}>or</Text>

          <Pressable onPress={() => commit("b")} style={styles.optB} disabled={committedSide !== null}>
            <Animated.Text style={[styles.optText, styles.optTextRight, { opacity: committedSide === "a" ? 0.3 : dimWhenLeanB }]}>
              {card.b.label}
              <Text style={styles.dir}>{"\n"}swipe right →</Text>
            </Animated.Text>
          </Pressable>

          <Animated.View style={[styles.noted, styles.notedLeft, { opacity: committedSide === "a" ? 1 : notedLeft }]}>
            <Text style={styles.notedText}>Noted</Text>
          </Animated.View>
          <Animated.View style={[styles.noted, styles.notedRight, { opacity: committedSide === "b" ? 1 : notedRight }]}>
            <Text style={styles.notedText}>Noted</Text>
          </Animated.View>
        </Animated.View>
      </View>

      <View style={styles.foot}>
        {stat ? (
          <View style={styles.statPill}>
            <Text style={styles.statText}>{stat}</Text>
          </View>
        ) : (
          <>
            {card.mid && (
              <Pressable onPress={commitMid} style={styles.midPill}>
                <Text style={styles.midPillText}>{card.mid.label}</Text>
              </Pressable>
            )}
            <View style={styles.hintRow}>
              <Text style={styles.hint}>Swipe the card — or tap an answer.</Text>
              {card.skippable && (
                <Pressable onPress={skip} hitSlop={8}>
                  <Text style={styles.skip}>skip this one</Text>
                </Pressable>
              )}
            </View>
          </>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  panel: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: theme.colors.bg,
    paddingHorizontal: 22,
    paddingTop: 16,
    paddingBottom: 22,
    zIndex: 5,
  },
  head: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", paddingBottom: 6 },
  title: {
    fontFamily: theme.fonts.mono,
    fontSize: 11,
    letterSpacing: 2,
    textTransform: "uppercase",
    color: theme.colors.accent,
  },
  count: { fontFamily: theme.fonts.mono, fontSize: 12, color: theme.colors.textMuted },
  stage: { flex: 1, marginTop: 10 },
  card: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: theme.colors.cardBg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 24,
    padding: 28,
    justifyContent: "space-between",
  },
  cardBehind: { transform: [{ scale: 0.955 }, { translateY: 12 }], opacity: 0.55 },
  kicker: {
    fontFamily: theme.fonts.mono,
    fontSize: 10.5,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    color: theme.colors.textMuted,
    lineHeight: 16,
  },
  optA: { alignSelf: "flex-start", marginTop: 18, maxWidth: "88%" },
  optB: { alignSelf: "flex-end", marginBottom: 6, maxWidth: "88%" },
  optText: { fontFamily: theme.fonts.serif, fontSize: 28, lineHeight: 34, color: theme.colors.textPrimary },
  optTextRight: { textAlign: "right" },
  dir: {
    fontFamily: theme.fonts.mono,
    fontSize: 11,
    letterSpacing: 1.3,
    textTransform: "uppercase",
    color: theme.colors.textMuted,
    lineHeight: 24,
  },
  or: { fontFamily: theme.fonts.serif, fontStyle: "italic", color: theme.colors.textMuted, fontSize: 15, alignSelf: "center" },
  noted: {
    position: "absolute",
    top: 26,
    borderWidth: 3,
    borderColor: theme.colors.accent,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 7,
  },
  notedLeft: { left: 24, transform: [{ rotate: "-10deg" }] },
  notedRight: { right: 24, transform: [{ rotate: "10deg" }] },
  notedText: {
    color: theme.colors.accent,
    fontFamily: theme.fonts.mono,
    fontSize: 14,
    letterSpacing: 2.5,
    textTransform: "uppercase",
  },
  foot: { minHeight: 92, alignItems: "center", justifyContent: "center", paddingTop: 14, gap: 10 },
  midPill: {
    borderWidth: 1.5,
    borderColor: theme.colors.accent,
    borderRadius: theme.radius.pill,
    paddingHorizontal: 18,
    paddingVertical: 9,
    backgroundColor: theme.colors.cardBg,
  },
  midPillText: { color: theme.colors.accent, fontSize: 14 },
  hintRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  hint: { fontSize: 12.5, color: theme.colors.textMuted, textAlign: "center" },
  skip: { fontSize: 12.5, color: theme.colors.accent, textDecorationLine: "underline" },
  statPill: {
    backgroundColor: theme.colors.accentTint,
    borderRadius: theme.radius.pill,
    paddingHorizontal: 16,
    paddingVertical: 8,
    maxWidth: "94%",
  },
  statText: { fontFamily: theme.fonts.mono, fontSize: 11.5, lineHeight: 17, color: theme.colors.accent, textAlign: "center" },
});
