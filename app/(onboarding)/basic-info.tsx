import { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, Alert } from "react-native";
import { router } from "expo-router";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthProvider";
import { theme } from "@/lib/theme";
import type { Gender } from "@/lib/types";

const GENDERS: Gender[] = ["woman", "man", "nonbinary"];

export default function BasicInfo() {
  const { session } = useAuth();
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [gender, setGender] = useState<Gender | null>(null);
  const [seeking, setSeeking] = useState<Gender[]>([]);
  const [city, setCity] = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function toggleSeeking(g: Gender) {
    setSeeking((prev) => (prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]));
  }

  async function handleContinue() {
    const ageNum = parseInt(age, 10);
    if (!name.trim() || !ageNum || ageNum < 18 || !gender || seeking.length === 0 || !city.trim()) {
      Alert.alert("A few fields still need filling in", "Name, age (18+), gender, who you're seeking, and city are all required.");
      return;
    }
    if (!session) return;

    setSubmitting(true);
    const { error } = await supabase.from("profiles").upsert(
      {
        id: session.user.id,
        name: name.trim(),
        age: ageNum,
        gender,
        seeking,
        city: city.trim(),
        neighborhood: neighborhood.trim() || null,
        onboarding_complete: false,
      },
      { onConflict: "id" }
    );
    setSubmitting(false);

    if (error) {
      Alert.alert("Couldn't save", error.message);
      return;
    }
    router.push("/(onboarding)/questionnaire");
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.eyebrow}>Step 1 of 4</Text>
      <Text style={styles.title}>The basics</Text>
      <Text style={styles.subtitle}>This won't be shown until someone matches with you.</Text>

      <TextInput style={styles.input} placeholder="First name" placeholderTextColor={theme.colors.textMuted} value={name} onChangeText={setName} />
      <TextInput
        style={styles.input}
        placeholder="Age"
        placeholderTextColor={theme.colors.textMuted}
        keyboardType="number-pad"
        value={age}
        onChangeText={setAge}
      />

      <Text style={styles.label}>I am</Text>
      <View style={styles.chipRow}>
        {GENDERS.map((g) => (
          <Pressable key={g} onPress={() => setGender(g)} style={[styles.chip, gender === g && styles.chipSelected]}>
            <Text style={[styles.chipText, gender === g && styles.chipTextSelected]}>{g}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>Interested in (select all that apply)</Text>
      <View style={styles.chipRow}>
        {GENDERS.map((g) => (
          <Pressable key={g} onPress={() => toggleSeeking(g)} style={[styles.chip, seeking.includes(g) && styles.chipSelected]}>
            <Text style={[styles.chipText, seeking.includes(g) && styles.chipTextSelected]}>{g}</Text>
          </Pressable>
        ))}
      </View>

      <TextInput style={styles.input} placeholder="City (e.g. Austin, TX)" placeholderTextColor={theme.colors.textMuted} value={city} onChangeText={setCity} />
      <TextInput
        style={styles.input}
        placeholder="Neighborhood (optional)"
        placeholderTextColor={theme.colors.textMuted}
        value={neighborhood}
        onChangeText={setNeighborhood}
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
  label: { fontSize: 13, color: theme.colors.textSecondary, marginBottom: 8, marginTop: 4, fontWeight: "600" },
  input: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.control,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: theme.colors.textPrimary,
    marginBottom: 14,
  },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 },
  chip: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.pill, paddingHorizontal: 16, paddingVertical: 9, backgroundColor: "#fff" },
  chipSelected: { backgroundColor: theme.colors.accent, borderColor: theme.colors.accent },
  chipText: { fontSize: 13, color: theme.colors.textSecondary, textTransform: "capitalize" },
  chipTextSelected: { color: "#fff" },
  button: { backgroundColor: theme.colors.accent, borderRadius: theme.radius.pill, paddingVertical: 15, alignItems: "center", marginTop: 16 },
  buttonText: { color: "#fff", fontSize: 15, fontWeight: "600" },
});
