import { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, Alert } from "react-native";
import { router } from "expo-router";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthProvider";
import { theme } from "@/lib/theme";
import { QUESTIONS } from "@/lib/questions";
import type { QuestionnaireAnswers } from "@/lib/types";

type AnswerMap = Record<string, unknown>;

// Custom (write-your-own) answers live under `<key>_custom` with the
// canonical key left unset, so scoring treats the question as skipped for
// this user -- see the note in lib/questions.ts.
const customKey = (key: string) => `${key}_custom`;

export default function Questionnaire() {
  const { session } = useAuth();
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<AnswerMap>({});
  const [submitting, setSubmitting] = useState(false);
  const [textDraft, setTextDraft] = useState("");
  const [customDraft, setCustomDraft] = useState("");
  const [customOpen, setCustomOpen] = useState(false);

  const question = QUESTIONS[index];
  const isLast = index === QUESTIONS.length - 1;
  const currentAnswer = answers[question.key];

  function setAnswer(value: unknown) {
    setAnswers((prev) => {
      const next = { ...prev, [question.key]: value };
      delete next[customKey(question.key)];
      return next;
    });
    setCustomOpen(false);
    setCustomDraft("");
  }

  function commitDrafts(): AnswerMap {
    // Fold whatever is typed into `answers` before navigating/saving.
    const next = { ...answers };
    if (question.type === "text" && textDraft.trim()) {
      next[question.key] = textDraft.trim();
    }
    if (question.allowCustom && customOpen && customDraft.trim()) {
      next[customKey(question.key)] = customDraft.trim();
      delete next[question.key];
    }
    setAnswers(next);
    return next;
  }

  function navigate(newIndex: number, latest: AnswerMap) {
    const q = QUESTIONS[newIndex];
    setTextDraft(String(latest[q.key] ?? ""));
    const storedCustom = latest[customKey(q.key)];
    setCustomDraft(String(storedCustom ?? ""));
    setCustomOpen(Boolean(storedCustom));
    setIndex(newIndex);
  }

  async function goNext() {
    const latest = commitDrafts();
    if (!isLast) {
      navigate(index + 1, latest);
      return;
    }
    await finish(latest);
  }

  function goBack() {
    if (index === 0) {
      router.back();
      return;
    }
    navigate(index - 1, answers);
  }

  function skip() {
    const next = { ...answers };
    delete next[question.key];
    delete next[customKey(question.key)];
    setAnswers(next);
    if (!isLast) {
      navigate(index + 1, next);
    } else {
      finish(next);
    }
  }

  async function finish(latest: AnswerMap) {
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
    for (const [key, value] of Object.entries(latest)) {
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

  function canAdvance() {
    if (question.skippable) return true;
    if (question.allowCustom && customOpen) return customDraft.trim().length > 0;
    if (question.type === "text") return textDraft.trim().length > 0;
    if (question.type === "multi_choice") return Array.isArray(currentAnswer) && currentAnswer.length > 0;
    return currentAnswer !== undefined && currentAnswer !== null;
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.progress}>
        Question {index + 1} of {QUESTIONS.length}
      </Text>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${((index + 1) / QUESTIONS.length) * 100}%` }]} />
      </View>

      <Text style={styles.prompt}>{question.prompt}</Text>

      {question.type === "scale" && (
        <View style={styles.scaleRow}>
          {question.scaleLabels && (
            <View style={styles.scaleLabels}>
              <Text style={[styles.scaleLabelText, styles.scaleLabelLeft]}>{question.scaleLabels[0]}</Text>
              <Text style={[styles.scaleLabelText, styles.scaleLabelRight]}>{question.scaleLabels[1]}</Text>
            </View>
          )}
          <View style={styles.scaleButtons}>
            {[1, 2, 3, 4, 5].map((n) => (
              <Pressable key={n} onPress={() => setAnswer(n)} style={[styles.scaleDot, currentAnswer === n && styles.scaleDotSelected]}>
                <Text style={[styles.scaleDotText, currentAnswer === n && styles.scaleDotTextSelected]}>{n}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      {question.type === "single_choice" && (
        <View style={styles.optionList}>
          {question.options?.map((opt) => (
            <Pressable
              key={opt.value}
              onPress={() => setAnswer(opt.value)}
              style={[styles.option, currentAnswer === opt.value && styles.optionSelected]}
            >
              <Text style={[styles.optionText, currentAnswer === opt.value && styles.optionTextSelected]}>{opt.label}</Text>
            </Pressable>
          ))}

          {question.allowCustom && (
            <Pressable
              onPress={() => {
                setCustomOpen((open) => !open);
                if (!customOpen) {
                  setAnswers((prev) => {
                    const next = { ...prev };
                    delete next[question.key];
                    return next;
                  });
                }
              }}
              style={[styles.option, styles.customToggle, customOpen && styles.optionSelected]}
            >
              <Text style={[styles.optionText, customOpen && styles.optionTextSelected]}>
                None of these — I'll say it my way
              </Text>
            </Pressable>
          )}

          {question.allowCustom && customOpen && (
            <TextInput
              style={styles.customInput}
              placeholder="Your answer, your words..."
              placeholderTextColor={theme.colors.textMuted}
              multiline
              autoFocus
              value={customDraft}
              onChangeText={setCustomDraft}
            />
          )}
        </View>
      )}

      {question.type === "multi_choice" && (
        <View style={styles.chipWrap}>
          {question.options?.map((opt) => {
            const selected = Array.isArray(currentAnswer) && currentAnswer.includes(opt.value);
            return (
              <Pressable
                key={opt.value}
                onPress={() => {
                  const current = Array.isArray(currentAnswer) ? (currentAnswer as string[]) : [];
                  const max = question.maxSelect ?? 99;
                  if (selected) {
                    setAnswer(current.filter((x) => x !== opt.value));
                  } else if (current.length < max) {
                    setAnswer([...current, opt.value]);
                  }
                }}
                style={[styles.chip, selected && styles.chipSelected]}
              >
                <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{opt.label}</Text>
              </Pressable>
            );
          })}
          {question.maxSelect && (
            <Text style={styles.hint}>
              {Array.isArray(currentAnswer) ? currentAnswer.length : 0} / {question.maxSelect} selected
            </Text>
          )}
        </View>
      )}

      {question.type === "text" && (
        <TextInput
          style={styles.textArea}
          placeholder="Type your answer..."
          placeholderTextColor={theme.colors.textMuted}
          multiline
          value={textDraft}
          onChangeText={setTextDraft}
        />
      )}

      <View style={styles.footer}>
        <Pressable onPress={goBack} style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonText}>Back</Text>
        </Pressable>
        {question.skippable && (
          <Pressable onPress={skip} style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>Skip</Text>
          </Pressable>
        )}
        <Pressable onPress={goNext} disabled={!canAdvance() || submitting} style={[styles.button, (!canAdvance() || submitting) && styles.buttonDisabled]}>
          <Text style={styles.buttonText}>{submitting ? "Saving..." : isLast ? "Finish" : "Next"}</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, backgroundColor: theme.colors.bg, padding: 24, paddingTop: 60, paddingBottom: 40 },
  progress: { fontSize: 12, color: theme.colors.textMuted, marginBottom: 8 },
  progressTrack: { height: 4, backgroundColor: theme.colors.border, borderRadius: 2, marginBottom: 28, overflow: "hidden" },
  progressFill: { height: 4, backgroundColor: theme.colors.accent, borderRadius: 2 },
  prompt: { fontSize: 22, color: theme.colors.textPrimary, marginBottom: 28, lineHeight: 30 },
  scaleRow: { marginBottom: 20 },
  scaleLabels: { flexDirection: "row", justifyContent: "space-between", gap: 24, marginBottom: 12 },
  scaleLabelText: { fontSize: 12, color: theme.colors.textMuted, flexShrink: 1 },
  scaleLabelLeft: { textAlign: "left" },
  scaleLabelRight: { textAlign: "right" },
  scaleButtons: { flexDirection: "row", justifyContent: "space-between" },
  scaleDot: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  scaleDotSelected: { backgroundColor: theme.colors.accent, borderColor: theme.colors.accent },
  scaleDotText: { fontSize: 16, color: theme.colors.textPrimary },
  scaleDotTextSelected: { color: "#fff" },
  optionList: { gap: 10, marginBottom: 20 },
  option: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.control, paddingVertical: 14, paddingHorizontal: 16, backgroundColor: "#fff" },
  optionSelected: { backgroundColor: theme.colors.accent, borderColor: theme.colors.accent },
  optionText: { fontSize: 15, color: theme.colors.textPrimary, lineHeight: 21 },
  optionTextSelected: { color: "#fff" },
  customToggle: { borderStyle: "dashed" },
  customInput: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: theme.colors.accent,
    borderRadius: theme.radius.control,
    padding: 14,
    fontSize: 15,
    color: theme.colors.textPrimary,
    minHeight: 80,
    textAlignVertical: "top",
  },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 20 },
  chip: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.pill, paddingHorizontal: 16, paddingVertical: 9, backgroundColor: "#fff" },
  chipSelected: { backgroundColor: theme.colors.accent, borderColor: theme.colors.accent },
  chipText: { fontSize: 13, color: theme.colors.textSecondary },
  chipTextSelected: { color: "#fff" },
  hint: { fontSize: 12, color: theme.colors.textMuted, width: "100%", marginTop: 4 },
  textArea: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.control,
    padding: 16,
    fontSize: 15,
    color: theme.colors.textPrimary,
    minHeight: 120,
    textAlignVertical: "top",
    marginBottom: 20,
  },
  footer: { flexDirection: "row", gap: 10, marginTop: "auto" },
  secondaryButton: { paddingVertical: 15, paddingHorizontal: 16 },
  secondaryButtonText: { color: theme.colors.textSecondary, fontSize: 14 },
  button: { flex: 1, backgroundColor: theme.colors.accent, borderRadius: theme.radius.pill, paddingVertical: 15, alignItems: "center" },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: "#fff", fontSize: 15, fontWeight: "600" },
});
