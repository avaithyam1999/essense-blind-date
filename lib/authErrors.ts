// Turns Supabase auth error messages into plain-language copy for the
// sign-up / sign-in screens. Unknown messages pass through unchanged.
export function friendlyAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("already registered") || m.includes("already been registered") || m.includes("user already exists")) {
    return "That email is already registered. Sign in instead, or reset your password.";
  }
  if (m.includes("invalid login credentials")) return "That email and password don't match.";
  if (m.includes("email not confirmed")) return "Confirm your email first. Check your inbox for the link, then sign in.";
  if (m.includes("rate limit") || m.includes("too many")) return "Too many attempts. Wait a minute and try again.";
  if (m.includes("invalid api key") || m.includes("no api key")) {
    return "The app can't connect to its server (API key problem). This is a setup issue, not your account.";
  }
  if (m.includes("failed to fetch") || m.includes("network") || m.includes("load failed")) {
    return "Couldn't reach the server. Check your connection and try again.";
  }
  if (m.includes("valid email") || m.includes("invalid format")) return "That email address doesn't look right.";
  return message;
}
