import { useCallback, useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthProvider";
import { theme } from "@/lib/theme";
import { BRAND } from "@/lib/brand";
import { SwipeCard } from "@/components/SwipeCard";
import { MatchModal } from "@/components/MatchModal";
import { consumeQueueStale, fetchTodaysPrompt } from "@/lib/dailyQuestion";
import type { PhysicalDescription, QueueCandidate } from "@/lib/types";

export default function Swipe() {
  const { session } = useAuth();
  const [candidates, setCandidates] = useState<QueueCandidate[]>([]);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [matchesToday, setMatchesToday] = useState(0);
  const [matchModal, setMatchModal] = useState<{ name: string; look: PhysicalDescription } | null>(null);
  const [dailyWaiting, setDailyWaiting] = useState(false);

  const loadQueue = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setIndex(0);
    const { data, error } = await supabase.rpc("build_queue", {
      requesting_user: session.user.id,
      queue_size: 10,
    });
    if (!error && data) {
      setCandidates(data as QueueCandidate[]);
    }
    setLoading(false);
  }, [session]);

  useEffect(() => {
    loadQueue();
  }, [loadQueue]);

  // Today's AI question: show the banner while it's unanswered. Fails soft
  // (no banner) until the backend pieces are deployed.
  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    fetchTodaysPrompt()
      .then((p) => !cancelled && setDailyWaiting(Boolean(p && !p.answered_at)))
      .catch(() => !cancelled && setDailyWaiting(false));
    return () => {
      cancelled = true;
    };
  }, [session]);

  // Rebuild the queue with the sharper scores after a daily answer.
  useFocusEffect(
    useCallback(() => {
      if (consumeQueueStale()) {
        setDailyWaiting(false);
        loadQueue();
      }
    }, [loadQueue])
  );

  async function handleSwiped(direction: "like" | "pass") {
    const candidate = candidates[index];
    if (!session || !candidate) return;

    await supabase.from("swipes").insert({
      swiper_id: session.user.id,
      target_id: candidate.candidate_id,
      direction,
    });

    if (direction === "like") {
      const a = session.user.id < candidate.candidate_id ? session.user.id : candidate.candidate_id;
      const b = session.user.id < candidate.candidate_id ? candidate.candidate_id : session.user.id;
      const { data: matchRow } = await supabase
        .from("matches")
        .select("id")
        .eq("user_a", a)
        .eq("user_b", b)
        .maybeSingle();

      if (matchRow) {
        const { data: reveal } = await supabase.rpc("get_match_reveal", {
          requesting_user: session.user.id,
          match_id: (matchRow as { id: string }).id,
        });
        const row = Array.isArray(reveal) ? reveal[0] : null;
        if (row) {
          setMatchesToday((n) => n + 1);
          setMatchModal({ name: row.name, look: row.physical_description });
        }
      }
    }

    setIndex((i) => i + 1);
  }

  const remaining = candidates.slice(index, index + 2);

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.topbar}>
        <Text style={styles.brand}>{BRAND.name}</Text>
        <View style={styles.matchCounter}>
          <Text style={styles.matchCounterText}>{matchesToday} match{matchesToday === 1 ? "" : "es"} today</Text>
        </View>
      </View>

      {dailyWaiting && (
        <Pressable style={styles.dailyBanner} onPress={() => router.push("/(main)/daily")}>
          <Text style={styles.dailyBannerText}>✳ The matchmaker has a question for you today</Text>
          <Text style={styles.dailyBannerArrow}>→</Text>
        </Pressable>
      )}

      <View style={styles.deck}>
        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator color={theme.colors.accent} />
          </View>
        ) : remaining.length === 0 ? (
          <View style={styles.centered}>
            <Text style={styles.emptyTitle}>That&rsquo;s everyone for today</Text>
            <Text style={styles.emptySubtitle}>A fresh queue unlocks tomorrow, curated from your city and compatibility.</Text>
            <Pressable style={styles.reloadButton} onPress={loadQueue}>
              <Text style={styles.reloadButtonText}>Check again</Text>
            </Pressable>
          </View>
        ) : (
          remaining
            .slice()
            .reverse()
            .map((candidate, i) => (
              <SwipeCard
                key={candidate.candidate_id}
                candidate={candidate}
                isTop={i === remaining.length - 1}
                onSwiped={handleSwiped}
              />
            ))
        )}
      </View>

      {!loading && remaining.length > 0 && (
        <View style={styles.actions}>
          <Pressable style={[styles.actionButton, styles.passButton]} onPress={() => handleSwiped("pass")}>
            <Text style={[styles.actionIcon, { color: theme.colors.pass }]}>✕</Text>
          </Pressable>
          <Pressable style={[styles.actionButton, styles.likeButton]} onPress={() => handleSwiped("like")}>
            <Text style={[styles.actionIcon, { color: theme.colors.like }]}>♡</Text>
          </Pressable>
        </View>
      )}

      <MatchModal
        visible={!!matchModal}
        name={matchModal?.name ?? null}
        physicalDescription={matchModal?.look ?? null}
        onClose={() => setMatchModal(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bg, paddingHorizontal: 16 },
  topbar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 12 },
  brand: { fontSize: 18, color: theme.colors.textPrimary },
  matchCounter: { backgroundColor: theme.colors.accentTint, borderRadius: theme.radius.pill, paddingHorizontal: 12, paddingVertical: 5 },
  matchCounterText: { color: theme.colors.accent, fontSize: 12, fontWeight: "600" },
  dailyBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: theme.colors.accentTint,
    borderRadius: theme.radius.control,
    paddingHorizontal: 14,
    paddingVertical: 11,
    marginTop: 4,
  },
  dailyBannerText: { color: theme.colors.accent, fontSize: 13, fontWeight: "600", flexShrink: 1 },
  dailyBannerArrow: { color: theme.colors.accent, fontSize: 15, fontWeight: "700" },
  deck: { flex: 1, position: "relative", marginTop: 8 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 20 },
  emptyTitle: { fontSize: 20, color: theme.colors.textPrimary, marginBottom: 8, textAlign: "center" },
  emptySubtitle: { fontSize: 13, color: theme.colors.textSecondary, textAlign: "center", marginBottom: 20, lineHeight: 19 },
  reloadButton: { borderWidth: 1.5, borderColor: theme.colors.accent, borderRadius: theme.radius.pill, paddingHorizontal: 22, paddingVertical: 10 },
  reloadButtonText: { color: theme.colors.accent, fontSize: 14, fontWeight: "600" },
  actions: { flexDirection: "row", justifyContent: "center", gap: 24, paddingVertical: 20 },
  actionButton: { width: 56, height: 56, borderRadius: 28, borderWidth: 1.5, alignItems: "center", justifyContent: "center", backgroundColor: "#fff" },
  passButton: { borderColor: theme.colors.pass },
  likeButton: { borderColor: theme.colors.like },
  actionIcon: { fontSize: 22 },
});
