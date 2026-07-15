import { View, Text, Pressable, StyleSheet } from "react-native";
import { router } from "expo-router";
import { BRAND } from "@/lib/brand";
import { theme } from "@/lib/theme";

// First screen a signed-out user sees. The pitch lives here, not on the
// sign-in form.
export default function Welcome() {
  return (
    <View style={styles.container}>
      <View style={styles.hero}>
        <Text style={styles.wordmark}>{BRAND.name}</Text>
        <Text style={styles.tagline}>{BRAND.tagline}</Text>
        <Text style={styles.subtitle}>{BRAND.subtitle}</Text>
      </View>

      <View style={styles.actions}>
        <Pressable style={styles.primaryButton} onPress={() => router.push("/(auth)/sign-up")}>
          <Text style={styles.primaryButtonText}>Create account</Text>
        </Pressable>
        <Pressable style={styles.ghostButton} onPress={() => router.push("/(auth)/sign-in")}>
          <Text style={styles.ghostButtonText}>I already have an account</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bg, padding: 28, justifyContent: "space-between" },
  hero: { flex: 1, justifyContent: "center" },
  wordmark: { fontSize: 44, color: theme.colors.accent, fontWeight: "700", letterSpacing: -1, marginBottom: 14 },
  tagline: { fontSize: 24, color: theme.colors.textPrimary, marginBottom: 12, lineHeight: 32 },
  subtitle: { fontSize: 15, color: theme.colors.textSecondary, lineHeight: 22, maxWidth: 320 },
  actions: { gap: 12, paddingBottom: 24 },
  primaryButton: { backgroundColor: theme.colors.accent, borderRadius: theme.radius.pill, paddingVertical: 16, alignItems: "center" },
  primaryButtonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  ghostButton: { borderWidth: 1.5, borderColor: theme.colors.accent, borderRadius: theme.radius.pill, paddingVertical: 15, alignItems: "center" },
  ghostButtonText: { color: theme.colors.accent, fontSize: 15, fontWeight: "600" },
});
