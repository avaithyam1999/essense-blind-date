import { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, Alert } from "react-native";
import { router } from "expo-router";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthProvider";
import { theme } from "@/lib/theme";
import { QUESTIONS } from "@/lib/questions";
import type { QuestionnaireAnswers } from "@/lib/types";

type AnswerMap = Record<string, unknown>;

export default function Questionnaire() {
  const { session } = useAuth();
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<AnswerMap>({});
  const [submitting, setSubmitting] = useState(false);
  const [textDraft, setTextDraft] = useState("");

  const question = QUESTIONS[index];
  const isLast = index === QUESTIONS.length - 1;
  const currentAnswer = answers[question.key];

  function setAnswer(value: unknown) {
    setAnswers((prev) => ({ ...prev, [question.key]: value }));
  }

  async function goNext() {
    if (question.type === "text" && textDraft.trim()) {
      setAnswer(textDraft.trim());
    }
    if (!isLast) {
      setTextDraft(String(answers[QUESTIONS[index + 1].key] ?? ""));
      setIndex(index + 1);
      return;
    }
    await finish();
  }

  function goBack() {
    if (index === 0) {
      router.back();
      return;
    }
    setTextDraft(String(answers[QUESTIONS[index - 1].key] ?? ""));
    setIndex(index - 1);
  }

  function skip() {
    setAnswers((prev) => {
      const next = { ...prev };
      delete next[question.key];
      return next;
    });
    if (!isLast) {
      setTextDraft(String(answers[QUESTIONS[index + 1].key] ?? ""));
      setIndex(index + 1);
    } else {
      finish();
    }
  }

  async function finish() {
    if (!session) return;

    const grouped: QuestionnaireAnswers = {
      values_lifestyle: {} as QuestionnaireAnswers["values_lifestyle"],
      interests: {} as QuestionnaireAnswers["interests"],
      personality: {} as QuestionnaireAnswers["personality"],
    };
    for (const q of QUESTIONS) {
      const value = answers[q.key];
      if (value === undefined) continue;
      (grouped[q.category] as unknown as AnswerMap)[q.key] = value;
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
              <Text style={styles.scaleLabelText}>{question.scaleLabels[0]}</Text>
              <Text style={styles.scaleLabelText}>{question.scaleLabels[1]}</Text>
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
            <Pressable key={opt} onPress={() => setAnswer(opt)} style={[styles.option, currentAnswer === opt && styles.optionSelected]}>
              <Text style={[styles.optionText, currentAnswer === opt && styles.optionTextSelected]}>{opt}</Text>
            </Pressable>
          ))}
        </View>
      )}

      {question.type === "multi_choice" && (
        <View style={styles.chipWrap}>
          {question.options?.map((opt) => {
            const selected = Array.isArray(currentAnswer) && currentAnswer.includes(opt);
            return (
              <Pressable
                key={opt}
                onPress={() => {
                  const current = Array.isArray(currentAnswer) ? (currentAnswer as string[]) : [];
                  const max = question.maxSelect ?? 99;
                  if (selected) {
                    setAnswer(current.filter((x) => x !== opt));
                  } else if (current.length < max) {
                    setAnswer([...current, opt]);
                  }
                }}
                style={[styles.chip, selected && styles.chipSelected]}
              >
                <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{opt}</Text>
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
  scaleLabels: { flexDirection: "row", justifyContent: "space-between", marginBottom: 12 },
  scaleLabelText: { fontSize: 12, color: theme.colors.textMuted },
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
  optionText: { fontSize: 15, color: theme.colors.textPrimary, textTransform: "capitalize" },
  optionTextSelected: { color: "#fff" },
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
