// Shared design tokens, carried over from the HTML prototypes
// (sample_swipe_cards.html / swipe_demo.html) so the real app matches the
// look we already validated.
export const theme = {
  colors: {
    bg: "#F7F3ED",
    cardBg: "#FFFFFF",
    textPrimary: "#241F1C",
    textSecondary: "#6E655C",
    textMuted: "#9C9086",
    accent: "#5B2A45",
    accentTint: "#F1E4EC",
    border: "#E7E0D6",
    pass: "#B9AFA2",
    like: "#5B2A45",
    danger: "#B33A3A",
  },
  radius: {
    card: 20,
    control: 12,
    pill: 999,
  },
  spacing: (n: number) => n * 4,
};
