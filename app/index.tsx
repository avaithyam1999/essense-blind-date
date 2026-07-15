import { useEffect, useState } from "react";
import { Redirect } from "expo-router";
import { ActivityIndicator, Text, View } from "react-native";
import { useAuth } from "@/lib/AuthProvider";
import { supabase } from "@/lib/supabase";
import { theme } from "@/lib/theme";
import { BRAND } from "@/lib/brand";

// Entry point: routes to sign-in, onboarding, or the swipe deck depending
// on auth + onboarding_complete state. No UI of its own.
export default function Index() {
  const { session, loading } = useAuth();
  const [checkingProfile, setCheckingProfile] = useState(true);
  const [profileExists, setProfileExists] = useState(false);
  const [onboardingComplete, setOnboardingComplete] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!session) {
      setCheckingProfile(false);
      return;
    }
    let cancelled = false;
    supabase
      .from("profiles")
      .select("onboarding_complete")
      .eq("id", session.user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        setProfileExists(Boolean(data));
        setOnboardingComplete(Boolean((data as { onboarding_complete?: boolean } | null)?.onboarding_complete));
        setCheckingProfile(false);
      });
    return () => {
      cancelled = true;
    };
  }, [session, loading]);

  if (loading || checkingProfile) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.bg, gap: 16 }}>
        <Text style={{ fontSize: 34, color: theme.colors.accent, fontWeight: "700", letterSpacing: -1 }}>{BRAND.name}</Text>
        <ActivityIndicator color={theme.colors.accent} />
      </View>
    );
  }

  if (!session) return <Redirect href="/(auth)/welcome" />;
  if (!profileExists) return <Redirect href="/(onboarding)/basic-info" />;
  if (!onboardingComplete) return <Redirect href="/(onboarding)/questionnaire" />;
  return <Redirect href="/(main)/swipe" />;
}
