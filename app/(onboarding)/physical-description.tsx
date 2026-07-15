import { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, Alert } from "react-native";
import { router } from "expo-router";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthProvider";
import { theme } from "@/lib/theme";

// Structured, non-photo physical description. build/height/signature_detail
// are intentionally optional -- see the concept doc's design note on why
// this isn't centered on height/build stats. This is only ever shown to a
// user after a mutual match (see get_match_reveal in schema.sql).
export default function PhysicalDescription() {
  const { session } = useAuth();
  const [favoriteFeature, setFavoriteFeature] = useState("");
  const [styleAndVibe, setStyleAndVibe] = useState("");
  const [build, setBuild] = useState("");
  const [height, setHeight] = useState("");
  const [hair, setHair] = useState("");
  const [signatureDetail, setSignatureDetail] = useState("");
  const [energyOthersNotice, setEnergyOthersNotice] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const requiredFilled =
    favoriteFeature.trim() && styleAndVibe.trim() && hair.trim() && energyOthersNotice.trim();

  async function handleFinish() {
    if (!requiredFilled) {
      Alert.alert("A few required fields left", "Favorite feature, style & vibe, hair, and how people describe your energy are all required. Build, height, and signature detail are optional.");
      return;
    }
    if (!session) return;

    setSubmitting(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        physical_description: {
          favorite_feature: favoriteFeature.trim(),
          style_and_vibe: styleAndVibe.trim(),
          build: build.trim() || null,
          height: height.trim() || null,
          hair: hair.trim(),
          signature_detail: signatureDetail.trim() || null,
          energy_others_notice: energyOthersNotice.trim(),
        },
        onboarding_complete: true,
      })
      .eq("id", session.user.id);
    setSubmitting(false);

    if (error) {
      Alert.alert("Couldn't save", error.message);
      return;
    }
    router.replace("/(main)/swipe");
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.eyebrow}>Step 4 of 4</Text>
      <Text style={styles.title}>The look</Text>
      <Text style={styles.subtitle}>No photos -- ever. This is revealed only after you match with someone.</Text>

      <Field label="Favorite physical feature" placeholder="e.g. My hands -- always covered in clay." value={favoriteFeature} onChangeText={setFavoriteFeature} />
      <Field label="Style & vibe" placeholder="e.g. Effortless and earthy, thrifted linen over anything trendy." value={styleAndVibe} onChangeText={setStyleAndVibe} />
      <Field label="Hair" placeholder="e.g. Dark brown, usually in a messy bun" value={hair} onChangeText={setHair} />
      <Field label="What people notice about your energy" placeholder="e.g. Warm and a little chaotic in the best way" value={energyOthersNotice} onChangeText={setEnergyOthersNotice} />
      <Field label="Build (optional)" placeholder="e.g. Average, athletic" value={build} onChangeText={setBuild} optional />
      <Field label="Height (optional)" placeholder="e.g. 5 ft 6 in" value={height} onChangeText={setHeight} optional />
      <Field label="A signature detail (optional)" placeholder="e.g. Always has at least one ring she made herself." value={signatureDetail} onChangeText={setSignatureDetail} optional />

      <Pressable style={styles.button} onPress={handleFinish} disabled={submitting}>
        <Text style={styles.buttonText}>{submitting ? "Finishing up..." : "Finish setting up my profile"}</Text>
      </Pressable>
    </ScrollView>
  );
}

function Field({
  label,
  placeholder,
  value,
  onChangeText,
  optional,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChangeText: (t: string) => void;
  optional?: boolean;
}) {
  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={styles.label}>
        {label} {optional && <Text style={styles.optionalTag}>optional</Text>}
      </Text>
      <TextInput style={styles.input} placeholder={placeholder} placeholderTextColor={theme.colors.textMuted} value={value} onChangeText={onChangeText} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, backgroundColor: theme.colors.bg, padding: 24, paddingTop: 60, paddingBottom: 60 },
  eyebrow: { fontSize: 12, letterSpacing: 1.5, textTransform: "uppercase", color: theme.colors.accent, fontWeight: "600", marginBottom: 8 },
  title: { fontSize: 26, color: theme.colors.textPrimary, marginBottom: 6 },
  subtitle: { fontSize: 13, color: theme.colors.textSecondary, marginBottom: 24 },
  label: { fontSize: 13, color: theme.colors.textSecondary, marginBottom: 8, fontWeight: "600" },
  optionalTag: { color: theme.colors.textMuted, fontWeight: "400", fontStyle: "italic" },
  input: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.control,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: theme.colors.textPrimary,
  },
  button: { backgroundColor: theme.colors.accent, borderRadius: theme.radius.pill, paddingVertical: 15, alignItems: "center", marginTop: 12 },
  buttonText: { color: "#fff", fontSize: 15, fontWeight: "600" },
});
