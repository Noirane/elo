import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { backend } from '@/backend';
import type { AdminReport } from '@/backend/types';
import { Back } from '@/components/icons';
import { Panel, RoundButton, Txt } from '@/components/ui';
import { useI18n } from '@/i18n';
import { formatTime } from '@/lib/time';
import { useElo } from '@/store';
import { colors, fonts, radius } from '@/theme';

/** Painel de denúncias: só aparece para quem administra o Elo. */
export default function ReportsScreen() {
  const { t, lang } = useI18n();
  const { actions } = useElo();
  const insets = useSafeAreaInsets();
  const [list, setList] = useState<AdminReport[] | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    setError(false);
    backend.listReports().then(setList).catch(() => setError(true));
  }, []);
  useEffect(load, [load]);

  const decide = async (r: AdminReport, action: 'suspend' | 'release') => {
    try {
      await backend.resolveReport(r.id, action);
      setList((l) => (l ?? []).filter((x) => x.id !== r.id));
      actions.showToast(t.admin.done);
    } catch {
      actions.showToast(t.admin.error);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.paper }}>
      <View style={[styles.head, { paddingTop: insets.top + 10 }]}>
        <RoundButton label={t.back} onPress={() => router.back()}><Back color={colors.ink} /></RoundButton>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 40 }}>
        <Txt variant="title" center style={{ fontSize: 34 }}>{t.admin.title}</Txt>
        <Txt center style={{ marginTop: 6, marginBottom: 10 }}>{t.admin.lead}</Txt>

        {error ? (
          <Pressable onPress={load}><Txt center style={{ color: colors.coral, marginTop: 20 }}>{t.admin.error}</Txt></Pressable>
        ) : !list ? (
          <ActivityIndicator color={colors.teal} style={{ marginTop: 30 }} />
        ) : list.length === 0 ? (
          <Txt center style={{ marginTop: 30 }}>{t.admin.empty}</Txt>
        ) : list.map((r) => (
          <Panel key={r.id} style={styles.card}>
            <View style={styles.row}>
              <Txt style={styles.reason}>{t.admin.total(r.total)}</Txt>
              <Txt variant="small" style={{ color: r.suspended ? colors.coral : colors.teal, fontFamily: fonts.bodyBold }}>
                {r.suspended ? t.admin.suspended : t.admin.active}
              </Txt>
            </View>

            <View style={styles.msgs}>
              {r.items.map((m, i) => (
                <View key={i} style={styles.item}>
                  <View style={styles.row}>
                    <Txt style={styles.who}>{t.report.reasons[m.reason] ?? m.reason}</Txt>
                    <Txt variant="small" style={{ fontSize: 11 }}>{formatTime(m.at, lang, t.elos.yesterday)}</Txt>
                  </View>
                  <Txt style={{ fontSize: 14, marginTop: 2, color: m.note ? colors.ink : colors.muted }}>{m.note ?? t.admin.noNote}</Txt>
                </View>
              ))}
            </View>

            <View style={styles.actions}>
              <Pressable accessibilityRole="button" onPress={() => decide(r, 'release')} style={[styles.btn, styles.btnGhost]}>
                <Txt style={[styles.btnText, { color: colors.ink }]}>{t.admin.release}</Txt>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={() => decide(r, 'suspend')} style={[styles.btn, { backgroundColor: colors.coral }]}>
                <Txt style={styles.btnText}>{t.admin.suspend}</Txt>
              </Pressable>
            </View>
          </Panel>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { paddingHorizontal: 16, paddingBottom: 6, flexDirection: 'row' },
  card: { marginTop: 12, padding: 16, gap: 6 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  reason: { fontFamily: fonts.bodyBold, fontSize: 16, flexShrink: 1 },
  msgs: { gap: 8, marginTop: 8 },
  item: { borderRadius: 14, paddingVertical: 9, paddingHorizontal: 12, backgroundColor: 'rgba(30,100,117,0.07)' },
  who: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.teal, flexShrink: 1 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  btn: { flex: 1, borderRadius: radius.pill, paddingVertical: 13, alignItems: 'center' },
  btnGhost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.line },
  btnText: { fontFamily: fonts.bodyBold, fontSize: 15, color: '#fff' },
});
