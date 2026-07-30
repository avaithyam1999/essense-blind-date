import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { router } from "expo-router";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthProvider";
import { theme } from "@/lib/theme";
import { BRAND } from "@/lib/brand";
import { QUESTIONS, type QuestionOption } from "@/lib/questions";
import { SCRIPT, type Payoff, type Step } from "@/lib/onboardingScript";
import { RapidFireDeck } from "@/components/RapidFireDeck";
import type { QuestionnaireAnswers } from "@/lib/types";

type AnswerMap = Record<string, unknown>;

// Custom (write-your-own) answers live under `<key>_custom` with the
// canonical key left unset, so scoring treats the question as skipped for
// this user -- see the note in lib/questions.ts.
const customKey = (key: string) => `${key}_custom`;

type ChatItem =
  | { id: number; type: "mm"; text: string }
  | { id: number; type: "me"; text: string }
  | { id: number; type: "stat"; text: string };

type ChipsStep = Extract<Step, { kind: "chips" }>;
type MultiStep = Extract<Step, { kind: "multi" }>;
type TextStep = Extract<Step, { kind: "text" }>;
type DeckStep = Extract<Step, { kind: "deck" }>;

type Awaiting =
  | { mode: "idle" }
  | { mode: "button"; label: string }
  | { mode: "chips"; step: ChipsStep }
  | { mode: "chips-custom"; step: ChipsStep }
  | { mode: "multi"; step: MultiStep; picks: string[] }
  | { mode: "text"; step: TextStep }
  | { mode: "deck"; step: DeckStep }
  | { mode: "finale" };

// The matchmaker-chat questionnaire (see lib/onboardingScript.ts for the
// flow itself). One conversation spine; rapid-fire decks and the finale
// slide over it as panels.
export default function Questionnaire() {
  const { session } = useAuth();
  const [stepIndex, setStepIndex] = useState(0);
  const [items, setItems] = useState<ChatItem[]>([]);
  const [typing, setTyping] = useState(false);
  const [phase, setPhase] = useState("getting to know you");
  const [awaiting, setAwaiting] = useState<Awaiting>({ mode: "idle" });
  const [progress, setProgress] = useState(0); // 0..1, answered/skipped keys
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const answersRef = useRef<AnswerMap>({});
  const handledRef = useRef(new Set<string>());
  const nextIdRef = useRef(1);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => () => timersRef.current.forEach(clearTimeout), []);

  function later(ms: number, fn: () => void) {
    timersRef.current.push(setTimeout(fn, ms));
  }

  function pushItem(type: ChatItem["type"], text: string) {
    setItems((prev) => [...prev, { id: nextIdRef.current++, type, text }]);
  }

  function sayThen(text: string, delay: number, then: () => void) {
    setTyping(true);
    later(delay, () => {
      setTyping(false);
      pushItem("mm", text);
      later(250, then);
    });
  }

  function advance() {
    setAwaiting({ mode: "idle" });
    setStepIndex((i) => i + 1);
  }

  function recordAnswer(key: string, value: unknown) {
    answersRef.current[key] = value;
    delete answersRef.current[customKey(key)];
    markHandled(key);
  }

  function recordCustom(key: string, text: string) {
    answersRef.current[customKey(key)] = text;
    delete answersRef.current[key];
    markHandled(key);
  }

  function recordSkip(key: string) {
    delete answersRef.current[key];
    delete answersRef.current[customKey(key)];
    markHandled(key);
  }

  function markHandled(key: string) {
    handledRef.current.add(key);
    setProgress(handledRef.current.size / QUESTIONS.length);
  }

  // After an answer lands: matchmaker quip, then stat pill, then next step.
  function afterPayoff(payoff: Payoff | undefined) {
    if (payoff?.quip) {
      sayThen(payoff.quip, 800, () => {
        if (payoff.stat) {
          pushItem("stat", payoff.stat);
          later(700, advance);
        } else {
          later(250, advance);
        }
      });
    } else if (payoff?.stat) {
      pushItem("stat", payoff.stat);
      later(700, advance);
    } else {
      later(250, advance);
    }
  }

  // The engine: each step of the script arms timers and/or awaits input.
  useEffect(() => {
    const step = SCRIPT[stepIndex];
    if (!step) return;
    switch (step.kind) {
      case "phase":
        setPhase(step.label);
        advance();
        break;
      case "say":
        sayThen(step.text, step.delay ?? 900, advance);
        break;
      case "button":
        setAwaiting({ mode: "button", label: step.label });
        break;
      case "chips":
        sayThen(step.ask ?? step.question.prompt, 1000, () => setAwaiting({ mode: "chips", step }));
        break;
      case "multi":
        sayThen(step.question.prompt, 1000, () => setAwaiting({ mode: "multi", step, picks: [] }));
        break;
      case "text":
        sayThen(step.question.prompt, 1000, () => {
          setDraft("");
          setAwaiting({ mode: "text", step });
        });
        break;
      case "deck":
        setAwaiting({ mode: "deck", step });
        break;
      case "finale":
        setAwaiting({ mode: "finale" });
        break;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIndex]);

  function pickChip(step: ChipsStep, opt: QuestionOption) {
    pushItem("me", opt.label);
    setAwaiting({ mode: "idle" });
    recordAnswer(step.question.key, opt.value);
    afterPayoff(step.payoffs?.[opt.value]);
  }

  function sendCustom(step: ChipsStep) {
    const text = draft.trim();
    if (!text) return;
    pushItem("me", text);
    setDraft("");
    setAwaiting({ mode: "idle" });
    recordCustom(step.question.key, text);
    afterPayoff(step.customPayoff ?? { quip: "Your words beat my options. Noted." });
  }

  function togglePick(step: MultiStep, value: string) {
    setAwaiting((prev) => {
      if (prev.mode !== "multi") return prev;
      const max = step.question.maxSelect ?? 99;
      const picks = prev.picks.includes(value)
        ? prev.picks.filter((v) => v !== value)
        : prev.picks.length < max
          ? [...prev.picks, value]
          : prev.picks;
      return { ...prev, picks };
    });
  }

  function confirmPicks(step: MultiStep, picks: string[]) {
    if (picks.length === 0) return;
    const labels = picks.map((v) => step.question.options?.find((o) => o.value === v)?.label ?? v);
    pushItem("me", labels.join(", "));
    setAwaiting({ mode: "idle" });
    recordAnswer(step.question.key, picks);
    afterPayoff(step.payoff);
  }

  function sendText(step: TextStep) {
    const text = draft.trim();
    if (!text) return;
    pushItem("me", text);
    setDraft("");
    setAwaiting({ mode: "idle" });
    recordAnswer(step.question.key, text);
    afterPayoff(step.payoff);
  }

  function passText(step: TextStep) {
    setDraft("");
    setAwaiting({ mode: "idle" });
    recordSkip(step.question.key);
    if (step.skipQuip) sayThen(step.skipQuip, 700, advance);
    else advance();
  }

  async function saveAndContinue() {
    if (!session) return;

    const grouped: QuestionnaireAnswers = {
      values_lifestyle: {} as QuestionnaireAnswers["values_lifestyle"],
      interests: {} as QuestionnaireAnswers["interests"],
      personality: {} as QuestionnaireAnswers["personality"],
    };
    // Custom answers share the base question's category.
    const categoryOf: Record<string, QuestionnaireAnswers[keyof QuestionnaireAnswers]> = {};
    for (const q of QUESTIONS) {
      categoryOf[q.key] = grouped[q.category];
      categoryOf[customKey(q.key)] = grouped[q.category];
    }
    for (const [key, value] of Object.entries(answersRef.current)) {
      if (value === undefined || !(key in categoryOf)) continue;
      (categoryOf[key] as unknown as AnswerMap)[key] = value;
    }

    setSubmitting(true);
    const { error } = await supabase.from("profiles").update({ questionnaire: grouped }).eq("id", session.user.id);
    setSubmitting(false);

    if (error) {
      Alert.alert("Couldn't save", error.message);
      return;
    }
    router.push("/(onboarding)/self-description");
  }

  const answeredCount = Object.keys(answersRef.current).length;
  const skippedCount = handledRef.current.size - new Set(
    Object.keys(answersRef.current).map((k) => k.replace(/_custom$/, ""))
  ).size;

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.head}>
        <Text style={styles.wordmark}>{BRAND.name}</Text>
        <Text style={styles.phase}>{phase}</Text>
      </View>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${4 + progress * 96}%` }]} />
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.chat}
        contentContainerStyle={styles.chatContent}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
        keyboardShouldPersistTaps="handled"
      >
        {items.map((item) => {
          if (item.type === "mm") {
            return <MarkupText key={item.id} text={item.text} style={styles.mm} emStyle={styles.mmEm} />;
          }
          if (item.type === "me") {
            return (
              <View key={item.id} style={styles.me}>
                <Text style={styles.meText}>{item.text}</Text>
              </View>
            );
          }
          return (
            <View key={item.id} style={styles.stat}>
              <Text style={styles.statText}>{item.text}</Text>
            </View>
          );
        })}

        {typing && <TypingDots />}

        {awaiting.mode === "button" && (
          <Pressable style={styles.cta} onPress={advance}>
            <Text style={styles.ctaText}>{awaiting.label}</Text>
          </Pressable>
        )}

        {awaiting.mode === "chips" && (
          <View style={styles.chips}>
            {awaiting.step.question.options?.map((opt) => (
              <Pressable key={opt.value} style={styles.chip} onPress={() => pickChip(awaiting.step, opt)}>
                <Text style={styles.chipText}>{opt.label}</Text>
              </Pressable>
            ))}
            {awaiting.step.question.allowCustom && (
              <Pressable
                style={[styles.chip, styles.chipDashed]}
                onPress={() => {
                  setDraft("");
                  setAwaiting({ mode: "chips-custom", step: awaiting.step });
                }}
              >
                <Text style={styles.chipText}>None of these — I'll say it my way</Text>
              </Pressable>
            )}
          </View>
        )}

        {awaiting.mode === "chips-custom" && (
          <View style={styles.chips}>
            <Pressable style={[styles.chip, styles.chipDashed]} onPress={() => setAwaiting({ mode: "chips", step: awaiting.step })}>
              <Text style={styles.chipText}>Actually, show me the options again</Text>
            </Pressable>
          </View>
        )}

        {awaiting.mode === "multi" && (
          <View style={styles.cloudWrap}>
            <View style={styles.cloud}>
              {awaiting.step.question.options?.map((opt) => {
                const selected = awaiting.picks.includes(opt.value);
                return (
                  <Pressable
                    key={opt.value}
                    style={[styles.cloudChip, selected && styles.cloudChipSelected]}
                    onPress={() => togglePick(awaiting.step, opt.value)}
                  >
                    <Text style={[styles.cloudChipText, selected && styles.cloudChipTextSelected]}>{opt.label}</Text>
                  </Pressable>
                );
              })}
            </View>
            <View style={styles.cloudFoot}>
              <Text style={styles.cloudCount}>
                {awaiting.picks.length} / {awaiting.step.question.maxSelect ?? "∞"}
              </Text>
              <Pressable
                style={[styles.cta, awaiting.picks.length === 0 && styles.ctaDisabled]}
                disabled={awaiting.picks.length === 0}
                onPress={() => confirmPicks(awaiting.step, awaiting.picks)}
              >
                <Text style={styles.ctaText}>Lock them in</Text>
              </Pressable>
            </View>
          </View>
        )}
      </ScrollView>

      {(awaiting.mode === "text" || awaiting.mode === "chips-custom") && (
        <View style={styles.inputBar}>
          <TextInput
            style={styles.input}
            placeholder={awaiting.mode === "text" ? "Your words..." : "Your answer, your way..."}
            placeholderTextColor={theme.colors.textMuted}
            value={draft}
            onChangeText={setDraft}
            multiline
            autoFocus
          />
          {awaiting.mode === "text" && awaiting.step.question.skippable && (
            <Pressable onPress={() => passText(awaiting.step)} hitSlop={8}>
              <Text style={styles.pass}>Pass</Text>
            </Pressable>
          )}
          <Pressable
            style={[styles.send, !draft.trim() && styles.ctaDisabled]}
            disabled={!draft.trim()}
            onPress={() => (awaiting.mode === "text" ? sendText(awaiting.step) : sendCustom(awaiting.step))}
          >
            <Text style={styles.sendText}>↑</Text>
          </Pressable>
        </View>
      )}

      <RapidFireDeck
        visible={awaiting.mode === "deck"}
        title={awaiting.mode === "deck" ? awaiting.step.title : "Rapid fire"}
        cards={awaiting.mode === "deck" ? awaiting.step.cards : []}
        onAnswer={recordAnswer}
        onSkip={recordSkip}
        onComplete={advance}
      />

      {awaiting.mode === "finale" && (
        <FinalePanel
          answered={answeredCount}
          skipped={skippedCount}
          submitting={submitting}
          onContinue={saveAndContinue}
        />
      )}
    </KeyboardAvoidingView>
  );
}

// Renders *spans* in matchmaker copy as plum italics (the mockup's <em>).
function MarkupText({ text, style, emStyle }: { text: string; style: object; emStyle: object }) {
  const parts = text.split("*");
  return (
    <Text style={style}>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <Text key={i} style={emStyle}>
            {part}
          </Text>
        ) : (
          part
        )
      )}
    </Text>
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

function FinalePanel({
  answered,
  skipped,
  submitting,
  onContinue,
}: {
  answered: number;
  skipped: number;
  submitting: boolean;
  onContinue: () => void;
}) {
  const slide = useRef(new Animated.Value(600)).current;
  useEffect(() => {
    Animated.timing(slide, { toValue: 0, duration: 480, useNativeDriver: false }).start();
  }, [slide]);

  return (
    <Animated.View style={[styles.finale, { transform: [{ translateY: slide }] }]}>
      <Text style={styles.finKicker}>profile ready</Text>
      <Text style={styles.finTitle}>That's the whole interview — and not a form in sight.</Text>
      <Text style={styles.finRecap}>
        {answered} signals gathered{skipped > 0 ? `  ·  ${skipped} passed` : ""}  ·  0 forms filled
      </Text>
      <Text style={styles.finNote}>
        Your answers only ever surface as compatibility. Nobody sees them as a list — they just feel them as a
        surprisingly good match.
      </Text>
      <Pressable style={[styles.cta, styles.finCta, submitting && styles.ctaDisabled]} disabled={submitting} onPress={onContinue}>
        <Text style={styles.ctaText}>{submitting ? "Saving..." : "Save & keep going"}</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.bg },
  head: {
    paddingTop: 60,
    paddingHorizontal: 22,
    paddingBottom: 10,
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
  },
  wordmark: { fontFamily: theme.fonts.serif, fontSize: 17, color: theme.colors.textPrimary },
  phase: {
    fontFamily: theme.fonts.mono,
    fontSize: 10.5,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    color: theme.colors.textMuted,
  },
  progressTrack: { height: 3, marginHorizontal: 22, marginBottom: 4, backgroundColor: theme.colors.border, borderRadius: 2, overflow: "hidden" },
  progressFill: { height: 3, backgroundColor: theme.colors.accent, borderRadius: 2 },
  chat: { flex: 1 },
  chatContent: { paddingHorizontal: 22, paddingTop: 18, paddingBottom: 28, gap: 14 },
  mm: { fontFamily: theme.fonts.serif, fontSize: 17.5, lineHeight: 26, color: theme.colors.textPrimary, maxWidth: "92%" },
  mmEm: { fontStyle: "italic", color: theme.colors.accent },
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
    maxWidth: "94%",
  },
  statText: { fontFamily: theme.fonts.mono, fontSize: 11.5, lineHeight: 17, color: theme.colors.accent },
  typing: { flexDirection: "row", gap: 5, paddingVertical: 6, paddingHorizontal: 2 },
  typingDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: theme.colors.textMuted },
  cta: {
    alignSelf: "flex-end",
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radius.pill,
    paddingVertical: 13,
    paddingHorizontal: 26,
  },
  ctaDisabled: { opacity: 0.4 },
  ctaText: { color: theme.colors.bg, fontSize: 14.5, fontWeight: "600" },
  chips: { gap: 8, alignItems: "flex-end" },
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
  chipDashed: { borderStyle: "dashed" },
  chipText: { color: theme.colors.accent, fontSize: 14, lineHeight: 19 },
  cloudWrap: { gap: 12 },
  cloud: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  cloudChip: {
    backgroundColor: theme.colors.cardBg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  cloudChipSelected: { backgroundColor: theme.colors.accent, borderColor: theme.colors.accent },
  cloudChipText: { fontSize: 13, color: theme.colors.textSecondary },
  cloudChipTextSelected: { color: theme.colors.bg },
  cloudFoot: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  cloudCount: { fontFamily: theme.fonts.mono, fontSize: 12, color: theme.colors.textMuted },
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 24,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    backgroundColor: theme.colors.bg,
  },
  input: {
    flex: 1,
    backgroundColor: theme.colors.cardBg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: theme.colors.textPrimary,
    maxHeight: 120,
  },
  pass: { color: theme.colors.textSecondary, fontSize: 14, paddingVertical: 12 },
  send: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: theme.colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  sendText: { color: theme.colors.bg, fontSize: 18, fontWeight: "700" },
  finale: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: theme.colors.bg,
    justifyContent: "center",
    padding: 30,
    gap: 18,
    zIndex: 6,
  },
  finKicker: {
    fontFamily: theme.fonts.mono,
    fontSize: 11,
    letterSpacing: 2,
    textTransform: "uppercase",
    color: theme.colors.accent,
  },
  finTitle: { fontFamily: theme.fonts.serif, fontSize: 30, lineHeight: 38, color: theme.colors.textPrimary },
  finRecap: {
    fontFamily: theme.fonts.mono,
    fontSize: 12,
    color: theme.colors.textSecondary,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: theme.colors.border,
    paddingVertical: 12,
  },
  finNote: { fontSize: 13.5, lineHeight: 21, color: theme.colors.textSecondary, maxWidth: 340 },
  finCta: { alignSelf: "flex-start", marginTop: 6 },
});
