import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Animated, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { theme } from "@/lib/theme";
import { BRAND } from "@/lib/brand";
import {
  answerDailyPrompt,
  fetchTodaysPrompt,
  markQueueStale,
  type DailyPrompt,
} from "@/lib/dailyQuestion";

type Stage = "loading" | "asking" | "saving" | "done" | "empty" | "already-answered";

// The matchmaker's question of the day -- AI-personalized copy over the
// canonical trait schema (see lib/dailyQuestion.ts). One question, one
// answer, back to the deck.
export default function Daily() {
  const [prompt, setPrompt] = useState<DailyPrompt | null>(null);
  const [stage, setStage] = useState<Stage>("loading");
  const [showQuestion, setShowQuestion] = useState(false);
  const [picked, setPicked] = useState<string | number | null>(null);
  const [quip, setQuip] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchTodaysPrompt().then((p) => {
      if (cancelled) return;
      if (!p) {
        setStage("empty");
        return;
      }
      setPrompt(p);
      if (p.answered_at) {
        setStage("already-answered");
        return;
      }
      setStage("asking");
      // Small typing beat before the question appears.
      setTimeout(() => !cancelled && setShowQuestion(true), 900);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function submit(value: string | number, replyQuip: string | null) {
    if (!prompt || stage === "saving") return;
    setPicked(value);
    setStage("saving");
    const error = await answerDailyPrompt(prompt.id, value);
    if (error) {
      setErrorText(error);
      setStage("asking");
      setPicked(null);
      return;
    }
    markQueueStale();
    setQuip(replyQuip ?? prompt.quip ?? "Noted. Your matches just got a shade sharper.");
    setStage("done");
  }

  const pickedLabel =
    prompt?.options?.find((o) => o.value === picked)?.label ??
    (typeof picked === "number" ? `${picked} / 5` : String(picked ?? ""));

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.head}>
        <Text style={styles.wordmark}>{BRAND.name}</Text>
        <Text style={styles.eyebrow}>today&rsquo;s question</Text>
      </View>

      {stage === "loading" && (
        <View style={styles.centered}>
          <ActivityIndicator color={theme.colors.accent} />
          <Text style={styles.loadingNote}>The matchmaker is thinking of you...</Text>
        </View>
      )}

      {stage === "empty" && (
        <View style={styles.centered}>
          <Text style={styles.mm}>Nothing new today — you and I are all caught up.</Text>
          <Pressable style={styles.cta} onPress={() => router.back()}>
            <Text style={styles.ctaText}>Back to my deck</Text>
          </Pressable>
        </View>
      )}

      {stage === "already-answered" && (
        <View style={styles.centered}>
          <Text style={styles.mm}>You already answered today. I&rsquo;ll have a new one tomorrow.</Text>
          <Pressable style={styles.cta} onPress={() => router.back()}>
            <Text style={styles.ctaText}>Back to my deck</Text>
          </Pressable>
        </View>
      )}

      {(stage === "asking" || stage === "saving" || stage === "done") && prompt && (
        <ScrollView contentContainerStyle={styles.chat}>
          {!showQuestion ? (
            <TypingDots />
          ) : (
            <Text style={styles.mm}>{prompt.prompt}</Text>
          )}

          {showQuestion && stage !== "done" && prompt.options && (
            <View style={styles.chips}>
              {prompt.options.map((opt) => (
                <Pressable
                  key={opt.value}
                  style={styles.chip}
                  disabled={stage === "saving"}
                  onPress={() => submit(opt.value, opt.quip ?? null)}
                >
                  <Text style={styles.chipText}>{opt.label}</Text>
                </Pressable>
              ))}
            </View>
          )}

          {showQuestion && stage !== "done" && prompt.scale_labels && (
            <View style={styles.scaleBlock}>
              <View style={styles.scaleLabels}>
                <Text style={[styles.scaleLabelText, { textAlign: "left" }]}>{prompt.scale_labels[0]}</Text>
                <Text style={[styles.scaleLabelText, { textAlign: "right" }]}>{prompt.scale_labels[1]}</Text>
              </View>
              <View style={styles.scaleRow}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <Pressable
                    key={n}
                    style={styles.scaleDot}
                    disabled={stage === "saving"}
                    onPress={() => submit(n, null)}
                  >
                    <Text style={styles.scaleDotText}>{n}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}

          {errorText && <Text style={styles.error}>Couldn&rsquo;t save: {errorText}</Text>}

          {(stage === "saving" || stage === "done") && picked !== null && (
            <View style={styles.me}>
              <Text style={styles.meText}>{pickedLabel}</Text>
            </View>
          )}

          {stage === "done" && (
            <>
              <Text style={styles.mm}>{quip}</Text>
              <View style={styles.stat}>
                <Text style={styles.statText}>Signal saved. Tomorrow&rsquo;s deck knows it already.</Text>
              </View>
              <Pressable style={styles.cta} onPress={() => router.back()}>
                <Text style={styles.ctaText}>Back to my deck</Text>
              </Pressable>
            </>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function TypingDots() {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 550, useNativeDriver: false }),
        Animated.timing(anim, { toValue: 0, duration: 550, useNativeDriver: false }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [anim]);
  return (
    <View style={styles.typing}>
      {[0, 1, 2].map((i) => (
        <Animated.View
          key={i}
          style={[
            styles.typingDot,
            {
              opacity: anim.interpolate({
                inputRange: [0, 0.33, 0.66, 1],
                outputRange: i === 0 ? [1, 0.3, 0.3, 1] : i === 1 ? [0.3, 1, 0.3, 0.3] : [0.3, 0.3, 1, 0.3],
              }),
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bg },
  head: {
    paddingHorizontal: 22,
    paddingTop: 12,
    paddingBottom: 10,
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
  },
  wordmark: { fontFamily: theme.fonts.serif, fontSize: 17, color: theme.colors.textPrimary },
  eyebrow: {
    fontFamily: theme.fonts.mono,
    fontSize: 10.5,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    color: theme.colors.textMuted,
  },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: 30, gap: 20 },
  loadingNote: { fontSize: 13, color: theme.colors.textMuted },
  chat: { padding: 22, gap: 16 },
  mm: { fontFamily: theme.fonts.serif, fontSize: 19, lineHeight: 28, color: theme.colors.textPrimary },
  typing: { flexDirection: "row", gap: 5, paddingVertical: 6 },
  typingDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: theme.colors.textMuted },
  chips: { gap: 8, alignItems: "flex-end", marginTop: 6 },
  chip: {
    backgroundColor: theme.colors.cardBg,
    borderWidth: 1.5,
    borderColor: theme.colors.accent,
    borderRadius: 18,
    borderBottomRightRadius: 4,
    paddingVertical: 10,
    paddingHorizontal: 16,
    maxWidth: "86%",
  },
  chipText: { color: theme.colors.accent, fontSize: 14, lineHeight: 19 },
  scaleBlock: { marginTop: 10 },
  scaleLabels: { flexDirection: "row", justifyContent: "space-between", gap: 24, marginBottom: 12 },
  scaleLabelText: { fontSize: 12, color: theme.colors.textMuted, flexShrink: 1 },
  scaleRow: { flexDirection: "row", justifyContent: "space-between" },
  scaleDot: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.cardBg,
    alignItems: "center",
    justifyContent: "center",
  },
  scaleDotText: { fontSize: 16, color: theme.colors.textPrimary },
  me: {
    alignSelf: "flex-end",
    backgroundColor: theme.colors.accent,
    borderRadius: 18,
    borderBottomRightRadius: 4,
    paddingVertical: 10,
    paddingHorizontal: 16,
    maxWidth: "82%",
  },
  meText: { color: theme.colors.bg, fontSize: 14.5, lineHeight: 21 },
  stat: {
    alignSelf: "flex-start",
    backgroundColor: theme.colors.accentTint,
    borderRadius: theme.radius.pill,
    paddingVertical: 7,
    paddingHorizontal: 14,
  },
  statText: { fontFamily: theme.fonts.mono, fontSize: 11.5, color: theme.colors.accent },
  error: { color: theme.colors.danger, fontSize: 13 },
  cta: {
    alignSelf: "flex-end",
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radius.pill,
    paddingVertical: 13,
    paddingHorizontal: 26,
    marginTop: 8,
  },
  ctaText: { color: theme.colors.bg, fontSize: 14.5, fontWeight: "600" },
});
