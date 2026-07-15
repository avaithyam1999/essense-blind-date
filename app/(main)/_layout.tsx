import { Tabs } from "expo-router";
import { Text } from "react-native";
import { theme } from "@/lib/theme";

function TabIcon({ symbol, focused }: { symbol: string; focused: boolean }) {
  return <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.4 }}>{symbol}</Text>;
}

export default function MainLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.accent,
        tabBarInactiveTintColor: theme.colors.textMuted,
        tabBarStyle: { backgroundColor: "#fff", borderTopColor: theme.colors.border },
      }}
    >
      <Tabs.Screen name="swipe" options={{ title: "Discover", tabBarIcon: ({ focused }) => <TabIcon symbol="⟡" focused={focused} /> }} />
      <Tabs.Screen name="matches" options={{ title: "Matches", tabBarIcon: ({ focused }) => <TabIcon symbol="♡" focused={focused} /> }} />
      <Tabs.Screen name="profile" options={{ title: "Profile", tabBarIcon: ({ focused }) => <TabIcon symbol="◐" focused={focused} /> }} />
    </Tabs>
  );
}
