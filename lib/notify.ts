import { Alert, Platform } from "react-native";

// react-native-web ships Alert.alert as a no-op, so on the web build every
// error or validation message would silently disappear. Fall back to the
// browser's own alert there.
export function notify(title: string, message?: string) {
  if (Platform.OS === "web") {
    if (typeof window !== "undefined") window.alert(message ? `${title}\n\n${message}` : title);
    return;
  }
  Alert.alert(title, message);
}
