import { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, Alert } from "react-native";
import { router } from "expo-router";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthProvider";
import { theme } from "@/lib/theme";

// This is what shows on the pre-match swipe card, along with age/neighborhood
// and interest chips -- no name, no appearance. See lib/questions.ts for the
// structured questionnaire; this is the free-form personality pitch.
export default function SelfDescription() {
  const { session } = useAuth();
  const [bio, setBio] = useState("");
  const [teaser, setTeaser] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleContinue() {
    if (bio.trim().length < 20) {
      Alert.alert("Tell us a bit more", "Your bio should be at least a couple of sentences -- this is most of what people see before matching.");
      return;
    }
    if (!session) return;

    setSubmitting(true);
    const { error } = await supabase
      .from("profiles")
      .update({ self_description: bio.trim(), card_teaser: teaser.trim() || null })
      .eq("id", session.user.id);
    setSubmitting(false);

    if (error) {
      Alert.alert("Couldn't save", error.message);
      return;
    }
    router.push("/(onboarding)/physical-description");
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.eyebrow}>Step 3 of 4</Text>
      <Text style={styles.title}>Describe yourself</Text>
      <Text style={styles.subtitle}>This is what people see before you match. Make it sound like you.</Text>

      <Text style={styles.label}>About you</Text>
      <TextInput
        style={styles.textArea}
        placeholder="Who are you, what do you care about, what's your personality like..."
        placeholderTextColor={theme.colors.textMuted}
        multiline
        value={bio}
        onChangeText={setBio}
      />

      <Text style={styles.label}>A one-line hook (optional)</Text>
      <TextInput
        style={styles.input}
        placeholder="e.g. Will judge your kitchenware, gently."
        placeholderTextColor={theme.colors.textMuted}
        value={teaser}
        onChangeText={setTeaser}
      />

      <Pressable style={styles.button} onPress={handleContinue} disabled={submitting}>
        <Text style={styles.buttonText}>{submitting ? "Saving..." : "Continue"}</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, backgroundColor: theme.colors.bg, padding: 24, paddingTop: 60, paddingBottom: 60 },
  eyebrow: { fontSize: 12, letterSpacing: 1.5, textTransform: "uppercase", color: theme.colors.accent, fontWeight: "600", marginBottom: 8 },
  title: { fontSize: 26, color: theme.colors.textPrimary, marginBottom: 6 },
  subtitle: { fontSize: 13, color: theme.colors.textSecondary, marginBottom: 24 },
  label: { fontSize: 13, color: theme.colors.textSecondary, marginBottom: 8, fontWeight: "600" },
  input: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.control,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: theme.colors.textPrimary,
    marginBottom: 16,
  },
  textArea: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.control,
    padding: 16,
    fontSize: 15,
    color: theme.colors.textPrimary,
    minHeight: 140,
    textAlignVertical: "top",
    marginBottom: 20,
  },
  button: { backgroundColor: theme.colors.accent, borderRadius: theme.radius.pill, paddingVertical: 15, alignItems: "center", marginTop: 8 },
  buttonText: { color: "#fff", fontSize: 15, fontWeight: "600" },
});
