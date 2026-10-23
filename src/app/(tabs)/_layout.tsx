import { Tabs } from 'expo-router/js-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Chat, Compass, Gear } from '@/components/icons';
import { useI18n } from '@/i18n';
import { useElo } from '@/store';
import { colors, fonts } from '@/theme';

export default function TabsLayout() {
  const { t } = useI18n();
  const { elos } = useElo();
  const insets = useSafeAreaInsets();
  const badge = elos.reduce((s, e) => s + e.unread, 0) + elos.filter((e) => e.stale).length;
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.teal,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { backgroundColor: 'rgba(255,251,245,0.98)', borderTopColor: colors.line, height: 70 + insets.bottom, paddingTop: 6, paddingBottom: insets.bottom + 10 },
        tabBarLabelStyle: { fontFamily: fonts.bodyBold, fontSize: 11 },
        sceneStyle: { backgroundColor: colors.paper },
      }}>
      <Tabs.Screen name="index" options={{ title: t.tabs.islands, tabBarIcon: ({ color }) => <Compass color={color} /> }} />
      <Tabs.Screen
        name="elos"
        options={{
          title: t.tabs.elos,
          tabBarIcon: ({ color }) => <Chat color={color} />,
          tabBarBadge: badge || undefined,
          tabBarBadgeStyle: { backgroundColor: colors.coral, fontFamily: fonts.bodyBold, fontSize: 10 },
        }}
      />
      <Tabs.Screen name="ajustes" options={{ title: t.tabs.settings, tabBarIcon: ({ color }) => <Gear color={color} /> }} />
    </Tabs>
  );
}
