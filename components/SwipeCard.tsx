import { useRef } from "react";
import { Animated, PanResponder, View, Text, StyleSheet, useWindowDimensions } from "react-native";
import { theme } from "@/lib/theme";
import type { QueueCandidate } from "@/lib/types";

interface Props {
  candidate: QueueCandidate;
  onSwiped: (direction: "like" | "pass") => void;
  isTop: boolean;
}

// Pre-match card: age, neighborhood, self-description, interests, teaser,
// compatibility score. Deliberately no name and no physical_description --
// those only unlock after a mutual match (see get_match_reveal in schema.sql).
export function SwipeCard({ candidate, onSwiped, isTop }: Props) {
  // useWindowDimensions (not a module-level Dimensions.get) because on web
  // the initial layout width can read 0 before the first paint -- a
  // module-level constant would freeze at that 0 forever and make the
  // interpolate() calls below throw ("inputRange must be monotonically
  // non-decreasing"). Math.max guards the same edge case defensively.
  const { width: rawWidth } = useWindowDimensions();
  const screenWidth = rawWidth || 320;
  const swipeThreshold = Math.max(screenWidth * 0.28, 20);
  const position = useRef(new Animated.ValueXY()).current;

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dx) > 6,
      onPanResponderMove: Animated.event([null, { dx: position.x, dy: position.y }], { useNativeDriver: false }),
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dx > swipeThreshold) {
          forceSwipe("like");
        } else if (gesture.dx < -swipeThreshold) {
          forceSwipe("pass");
        } else {
          resetPosition();
        }
      },
    })
  ).current;

  function forceSwipe(direction: "like" | "pass") {
    const x = direction === "like" ? screenWidth * 1.5 : -screenWidth * 1.5;
    Animated.timing(position, {
      toValue: { x, y: 0 },
      duration: 220,
      useNativeDriver: false,
    }).start(() => onSwiped(direction));
  }

  function resetPosition() {
    Animated.spring(position, { toValue: { x: 0, y: 0 }, useNativeDriver: false }).start();
  }

  const rotate = position.x.interpolate({
    inputRange: [-screenWidth / 2, 0, screenWidth / 2],
    outputRange: ["-10deg", "0deg", "10deg"],
  });
  const likeOpacity = position.x.interpolate({ inputRange: [10, swipeThreshold], outputRange: [0, 1], extrapolate: "clamp" });
  const passOpacity = position.x.interpolate({ inputRange: [-swipeThreshold, -10], outputRange: [1, 0], extrapolate: "clamp" });

  const animatedStyle = isTop
    ? { transform: [{ translateX: position.x }, { translateY: position.y }, { rotate }] }
    : { transform: [{ scale: 0.97 }, { translateY: 8 }] };

  return (
    <Animated.View style={[styles.card, animatedStyle]} {...(isTop ? panResponder.panHandlers : {})}>
      <View style={styles.scoreBadge}>
        <Text style={styles.scoreBadgeText}>{candidate.compatibility_score}% compatible</Text>
      </View>

      <Text style={styles.anonLabel}>Match candidate</Text>
      <Text style={styles.meta}>
        {candidate.age} · {candidate.neighborhood}, {candidate.city}
      </Text>

      <Text style={styles.bio}>{candidate.self_description}</Text>

      <Text style={styles.sectionLabel}>Into</Text>
      <View style={styles.chipRow}>
        {candidate.top_hobbies?.map((hobby) => (
          <View key={hobby} style={styles.chip}>
            <Text style={styles.chipText}>{hobby}</Text>
          </View>
        ))}
      </View>

      {candidate.card_teaser ? <Text style={styles.teaser}>&ldquo;{candidate.card_teaser}&rdquo;</Text> : null}

      {isTop && (
        <>
          <Animated.View style={[styles.stamp, styles.stampLike, { opacity: likeOpacity }]}>
            <Text style={styles.stampLikeText}>Interested</Text>
          </Animated.View>
          <Animated.View style={[styles.stamp, styles.stampPass, { opacity: passOpacity }]}>
            <Text style={styles.stampPassText}>Pass</Text>
          </Animated.View>
        </>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 520,
    backgroundColor: theme.colors.cardBg,
    borderRadius: theme.radius.card,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 24,
  },
  scoreBadge: {
    alignSelf: "flex-end",
    backgroundColor: theme.colors.accentTint,
    borderRadius: theme.radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 5,
    marginBottom: 10,
  },
  scoreBadgeText: { color: theme.colors.accent, fontSize: 12, fontWeight: "600" },
  anonLabel: { fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: theme.colors.textMuted, fontWeight: "600", marginBottom: 4 },
  meta: { fontSize: 13, color: theme.colors.textMuted, marginBottom: 16 },
  bio: { fontSize: 15, lineHeight: 22, color: theme.colors.textPrimary, marginBottom: 18 },
  sectionLabel: { fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: theme.colors.textMuted, fontWeight: "600", marginBottom: 10 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 },
  chip: { backgroundColor: theme.colors.bg, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.pill, paddingHorizontal: 12, paddingVertical: 6 },
  chipText: { fontSize: 12, color: theme.colors.textSecondary },
  teaser: { fontSize: 13, fontStyle: "italic", color: theme.colors.accent, borderTopWidth: 1, borderTopColor: theme.colors.border, paddingTop: 14, marginTop: "auto" },
  stamp: { position: "absolute", top: 28, borderWidth: 3, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 6 },
  stampLike: { left: 20, borderColor: theme.colors.like, transform: [{ rotate: "-12deg" }] },
  stampLikeText: { color: theme.colors.like, fontWeight: "700", fontSize: 15, letterSpacing: 1, textTransform: "uppercase" },
  stampPass: { right: 20, borderColor: theme.colors.pass, transform: [{ rotate: "12deg" }] },
  stampPassText: { color: theme.colors.pass, fontWeight: "700", fontSize: 15, letterSpacing: 1, textTransform: "uppercase" },
});
