import { Modal, View, Text, Pressable, StyleSheet } from "react-native";
import { theme } from "@/lib/theme";
import type { PhysicalDescription } from "@/lib/types";

interface Props {
  visible: boolean;
  name: string | null;
  physicalDescription: PhysicalDescription | null;
  onClose: () => void;
}

// The one and only place name + physical_description get shown to another
// user -- fetched via the get_match_reveal RPC after a mutual like, never
// rendered on the pre-match SwipeCard.
export function MatchModal({ visible, name, physicalDescription, onClose }: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <Text style={styles.eyebrow}>It&rsquo;s a match</Text>
          <Text style={styles.name}>{name}</Text>

          {physicalDescription && (
            <View style={styles.lookBox}>
              <LookRow label="Favorite feature" value={physicalDescription.favorite_feature} />
              <LookRow label="Style & vibe" value={physicalDescription.style_and_vibe} />
              <LookRow label="Hair" value={physicalDescription.hair} />
              <LookRow label="People notice" value={physicalDescription.energy_others_notice} />
              {physicalDescription.build ? <LookRow label="Build" value={physicalDescription.build} /> : null}
              {physicalDescription.height ? <LookRow label="Height" value={physicalDescription.height} /> : null}
              {physicalDescription.signature_detail ? <LookRow label="Signature detail" value={physicalDescription.signature_detail} /> : null}
            </View>
          )}

          <Pressable style={styles.button} onPress={onClose}>
            <Text style={styles.buttonText}>Keep browsing</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function LookRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ marginBottom: 10 }}>
      <Text style={styles.lookLabel}>{label}</Text>
      <Text style={styles.lookValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(36,31,28,0.55)", alignItems: "center", justifyContent: "center", padding: 20 },
  modal: { backgroundColor: "#fff", borderRadius: 20, padding: 28, width: "100%", maxWidth: 360 },
  eyebrow: { fontSize: 12, letterSpacing: 1.5, textTransform: "uppercase", color: theme.colors.accent, fontWeight: "600", textAlign: "center", marginBottom: 6 },
  name: { fontSize: 26, color: theme.colors.textPrimary, textAlign: "center", marginBottom: 18 },
  lookBox: { backgroundColor: theme.colors.bg, borderRadius: 14, padding: 16, marginBottom: 22 },
  lookLabel: { fontSize: 11, color: theme.colors.textMuted, marginBottom: 2 },
  lookValue: { fontSize: 13, color: theme.colors.textPrimary },
  button: { backgroundColor: theme.colors.accent, borderRadius: theme.radius.pill, paddingVertical: 14, alignItems: "center" },
  buttonText: { color: "#fff", fontSize: 14, fontWeight: "600" },
});
