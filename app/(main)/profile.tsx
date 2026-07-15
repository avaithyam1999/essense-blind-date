import { useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthProvider";
import { theme } from "@/lib/theme";
import type { Profile } from "@/lib/types";

export default function ProfileScreen() {
  const { session } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session) return;
    supabase
      .from("profiles")
      .select("*")
      .eq("id", session.user.id)
      .maybeSingle()
      .then(({ data }) => {
        setProfile(data as Profile | null);
        setLoading(false);
      });
  }, [session]);

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.replace("/(auth)/welcome");
  }

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, styles.centered]}>
        <ActivityIndicator color={theme.colors.accent} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <Text style={styles.header}>Your profile</Text>

      <View style={styles.card}>
        <Text style={styles.name}>{profile?.name}</Text>
        <Text style={styles.meta}>
          {profile?.age} · {profile?.neighborhood ? `${profile.neighborhood}, ` : ""}
          {profile?.city}
        </Text>
        <Text style={styles.sectionLabel}>Bio</Text>
        <Text style={styles.bio}>{profile?.self_description || "Not set yet."}</Text>
      </View>

      <Text style={styles.note}>
        Editing profile details isn&rsquo;t wired up in this MVP yet -- update rows directly in Supabase, or reuse the
        onboarding screens as a starting point for an edit flow.
      </Text>

      <Pressable style={styles.signOutButton} onPress={handleSignOut}>
        <Text style={styles.signOutText}>Sign out</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bg, padding: 16 },
  centered: { alignItems: "center", justifyContent: "center" },
  header: { fontSize: 24, color: theme.colors.textPrimary, marginBottom: 16 },
  card: { backgroundColor: "#fff", borderRadius: theme.radius.card, borderWidth: 1, borderColor: theme.colors.border, padding: 20, marginBottom: 20 },
  name: { fontSize: 20, color: theme.colors.textPrimary, marginBottom: 4 },
  meta: { fontSize: 13, color: theme.colors.textMuted, marginBottom: 16 },
  sectionLabel: { fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: theme.colors.textMuted, fontWeight: "600", marginBottom: 6 },
  bio: { fontSize: 14, color: theme.colors.textPrimary, lineHeight: 20 },
  note: { fontSize: 12, color: theme.colors.textMuted, lineHeight: 18, marginBottom: 24 },
  signOutButton: { borderWidth: 1.5, borderColor: theme.colors.danger, borderRadius: theme.radius.pill, paddingVertical: 14, alignItems: "center" },
  signOutText: { color: theme.colors.danger, fontSize: 14, fontWeight: "600" },
});
