import { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthProvider";
import { theme } from "@/lib/theme";
import type { Message } from "@/lib/types";

// Chat for a single match. Access control lives in RLS (messages policies in
// schema.sql): only the two participants of the match can read or send, and
// only as themselves -- this screen doesn't need to re-check any of that.
export default function Chat() {
  const { matchId, name } = useLocalSearchParams<{ matchId: string; name?: string }>();
  const { session } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList<Message>>(null);

  const load = useCallback(async () => {
    if (!matchId) return;
    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .eq("match_id", matchId)
      .order("created_at", { ascending: true });
    if (!error && data) setMessages(data as Message[]);
    setLoading(false);
  }, [matchId]);

  useEffect(() => {
    load();
  }, [load]);

  // Live updates: append messages inserted by the other participant.
  useEffect(() => {
    if (!matchId) return;
    const channel = supabase
      .channel(`messages:${matchId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `match_id=eq.${matchId}` },
        (payload) => {
          const incoming = payload.new as Message;
          setMessages((prev) => (prev.some((m) => m.id === incoming.id) ? prev : [...prev, incoming]));
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [matchId]);

  async function send() {
    const body = draft.trim();
    if (!body || !session || !matchId || sending) return;
    setSending(true);
    const { data, error } = await supabase
      .from("messages")
      .insert({ match_id: matchId, sender_id: session.user.id, body })
      .select()
      .single();
    setSending(false);
    if (!error && data) {
      setDraft("");
      const sent = data as Message;
      setMessages((prev) => (prev.some((m) => m.id === sent.id) ? prev : [...prev, sent]));
    }
  }

  useEffect(() => {
    if (messages.length > 0) {
      // Defer so FlatList has rendered the new row before scrolling.
      const t = setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
      return () => clearTimeout(t);
    }
  }, [messages.length]);

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.backText}>‹ Back</Text>
        </Pressable>
        <Text style={styles.headerName}>{name ?? "Your match"}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <KeyboardAvoidingView
        style={styles.body}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={8}
      >
        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator color={theme.colors.accent} />
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <View style={styles.centered}>
                <Text style={styles.emptyText}>
                  You matched -- say something. No photos to hide behind here anyway.
                </Text>
              </View>
            }
            renderItem={({ item }) => {
              const mine = item.sender_id === session?.user.id;
              return (
                <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
                  <Text style={[styles.bubbleText, mine && styles.bubbleTextMine]}>{item.body}</Text>
                </View>
              );
            }}
          />
        )}

        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            placeholder="Write a message..."
            placeholderTextColor={theme.colors.textMuted}
            value={draft}
            onChangeText={setDraft}
            multiline
            onSubmitEditing={send}
          />
          <Pressable
            style={[styles.sendButton, (!draft.trim() || sending) && styles.sendButtonDisabled]}
            onPress={send}
            disabled={!draft.trim() || sending}
          >
            <Text style={styles.sendButtonText}>Send</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  backText: { color: theme.colors.accent, fontSize: 15, fontWeight: "600" },
  headerName: { flex: 1, textAlign: "center", fontSize: 16, color: theme.colors.textPrimary, fontWeight: "600" },
  headerSpacer: { width: 44 },
  body: { flex: 1 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
  emptyText: { color: theme.colors.textSecondary, fontSize: 14, textAlign: "center", lineHeight: 20 },
  listContent: { flexGrow: 1, padding: 16, gap: 8 },
  bubble: {
    maxWidth: "80%",
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  bubbleMine: { alignSelf: "flex-end", backgroundColor: theme.colors.accent, borderBottomRightRadius: 4 },
  bubbleTheirs: {
    alignSelf: "flex-start",
    backgroundColor: theme.colors.cardBg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderBottomLeftRadius: 4,
  },
  bubbleText: { fontSize: 15, lineHeight: 20, color: theme.colors.textPrimary },
  bubbleTextMine: { color: "#fff" },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    backgroundColor: theme.colors.bg,
  },
  input: {
    flex: 1,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.control,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: theme.colors.textPrimary,
    maxHeight: 120,
  },
  sendButton: {
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radius.pill,
    paddingHorizontal: 18,
    paddingVertical: 11,
  },
  sendButtonDisabled: { opacity: 0.4 },
  sendButtonText: { color: "#fff", fontSize: 14, fontWeight: "600" },
});
