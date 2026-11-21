import { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, KeyboardAvoidingView, Platform } from "react-native";
import { friendlyAuthError } from "@/lib/authErrors";
import { Link, router } from "expo-router";
import { supabase } from "@/lib/supabase";
import { theme } from "@/lib/theme";
import { BRAND } from "@/lib/brand";

export default function SignUp() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ kind: "error" | "info"; text: string } | null>(null);

  async function handleSignUp() {
    const trimmedEmail = email.trim();
    if (!trimmedEmail || password.length < 8) {
      setMessage({ kind: "error", text: "Enter an email and a password with at least 8 characters." });
      return;
    }
    setMessage(null);
    setSubmitting(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: trimmedEmail,
        password,
        options: {
          // On web, send the confirmation link back to whichever deploy the user
          // signed up on (production or a preview), not Supabase's Site URL default.
          emailRedirectTo: Platform.OS === "web" && typeof window !== "undefined" ? window.location.origin : undefined,
        },
      });
      if (error) {
        setMessage({ kind: "error", text: friendlyAuthError(error.message) });
        return;
      }
      // With "Confirm email" on, Supabase doesn't return an error for an
      // already-registered address (to avoid leaking which emails exist). It
      // returns a user with no identities instead.
      if (data.user && data.user.identities?.length === 0) {
        setMessage({ kind: "error", text: "That email is already registered. Sign in instead, or reset your password." });
        return;
      }
      if (!data.session) {
        // "Confirm email" is on: no session until the link is clicked.
        setMessage({ kind: "info", text: `Check your email. We sent a confirmation link to ${trimmedEmail}. Open it, then sign in.` });
        return;
      }
      router.replace("/(onboarding)/basic-info");
    } catch (e) {
      setMessage({ kind: "error", text: "Couldn't reach the server. Check your connection and try again." });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Text style={styles.eyebrow}>{BRAND.name}</Text>
      <Text style={styles.title}>Create your account</Text>
      <Text style={styles.subtitle}>{BRAND.tagline} Tell us about yourself — never what you look like.</Text>

      <TextInput
        style={styles.input}
        placeholder="Email"
        placeholderTextColor={theme.colors.textMuted}
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        placeholder="Password (min 8 characters)"
        placeholderTextColor={theme.colors.textMuted}
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

      {message && (
        <Text style={message.kind === "error" ? styles.error : styles.info} accessibilityLiveRegion="polite">
          {message.text}
        </Text>
      )}

      <Pressable style={[styles.button, submitting && styles.buttonDisabled]} onPress={handleSignUp} disabled={submitting}>
        <Text style={styles.buttonText}>{submitting ? "Creating account..." : "Create account"}</Text>
      </Pressable>

      <Link href="/(auth)/sign-in" style={styles.link}>
        Already have an account? Sign in
      </Link>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bg, padding: 24, justifyContent: "center" },
  eyebrow: {
    fontSize: 12,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    color: theme.colors.accent,
    fontWeight: "600",
    marginBottom: 8,
  },
  title: { fontSize: 28, color: theme.colors.textPrimary, marginBottom: 6 },
  subtitle: { fontSize: 14, color: theme.colors.textSecondary, marginBottom: 28 },
  input: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.control,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: theme.colors.textPrimary,
    marginBottom: 12,
  },
  button: {
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radius.pill,
    paddingVertical: 15,
    alignItems: "center",
    marginTop: 8,
  },
  buttonDisabled: { opacity: 0.6 },
  error: { color: theme.colors.danger, fontSize: 14, marginTop: 4, marginBottom: 4 },
  info: { color: theme.colors.textPrimary, fontSize: 14, marginTop: 4, marginBottom: 4 },
  buttonText: { color: "#fff", fontSize: 15, fontWeight: "600" },
  link: { textAlign: "center", color: theme.colors.accent, marginTop: 20, fontSize: 13 },
});
