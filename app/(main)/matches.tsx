import { useCallback, useEffect, useState } from "react";
import { View, Text, FlatList, StyleSheet, ActivityIndicator, Pressable, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthProvider";
import { theme } from "@/lib/theme";
import { MatchModal } from "@/components/MatchModal";
import type { PhysicalDescription } from "@/lib/types";

interface MatchRow {
  match_id: string;
  other_user_id: string;
  other_name: string;
  matched_at: string;
}

export default function Matches() {
  const { session } = useAuth();
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [detail, setDetail] = useState<{ name: string; look: PhysicalDescription } | null>(null);

  const load = useCallback(async () => {
    if (!session) return;
    const { data, error } = await supabase.rpc("list_matches", { requesting_user: session.user.id });
    if (!error && data) setMatches(data as MatchRow[]);
    setLoading(false);
    setRefreshing(false);
  }, [session]);

  useEffect(() => {
    load();
  }, [load]);

  async function openMatch(row: MatchRow) {
    if (!session) return;
    const { data } = await supabase.rpc("get_match_reveal", {
      requesting_user: session.user.id,
      match_id: row.match_id,
    });
    const result = Array.isArray(data) ? data[0] : null;
    if (result) {
      setDetail({ name: result.name, look: result.physical_description });
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <Text style={styles.header}>Matches</Text>
      {loading ? (
        <ActivityIndicator color={theme.colors.accent} style={{ marginTop: 40 }} />
      ) : matches.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No matches yet. Keep browsing your daily queue.</Text>
        </View>
      ) : (
        <FlatList
          data={matches}
          keyExtractor={(item) => item.match_id}
          contentContainerStyle={{ paddingHorizontal: 16 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
          renderItem={({ item }) => (
            <Pressable
              style={styles.row}
              onPress={() =>
                router.push({ pathname: "/chat/[matchId]", params: { matchId: item.match_id, name: item.other_name } })
              }
            >
              {/* Avatar opens the reveal (their look); the row itself opens chat. */}
              <Pressable style={styles.avatar} onPress={() => openMatch(item)} hitSlop={6}>
                <Text style={styles.avatarText}>{item.other_name.charAt(0)}</Text>
              </Pressable>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowName}>{item.other_name}</Text>
                <Text style={styles.rowSubtitle}>Matched {new Date(item.matched_at).toLocaleDateString()}</Text>
              </View>
              <Text style={styles.chatHint}>Chat ›</Text>
            </Pressable>
          )}
        />
      )}

      <MatchModal visible={!!detail} name={detail?.name ?? null} physicalDescription={detail?.look ?? null} onClose={() => setDetail(null)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bg },
  header: { fontSize: 24, color: theme.colors.textPrimary, paddingHorizontal: 16, paddingVertical: 12 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 },
  emptyText: { color: theme.colors.textSecondary, fontSize: 14, textAlign: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "#fff", borderRadius: theme.radius.control, borderWidth: 1, borderColor: theme.colors.border, padding: 14, marginBottom: 10 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: theme.colors.accentTint, alignItems: "center", justifyContent: "center" },
  avatarText: { color: theme.colors.accent, fontWeight: "600", fontSize: 16 },
  rowName: { fontSize: 15, color: theme.colors.textPrimary, marginBottom: 2 },
  rowSubtitle: { fontSize: 12, color: theme.colors.textMuted },
  chatHint: { fontSize: 13, color: theme.colors.accent, fontWeight: "600" },
});
