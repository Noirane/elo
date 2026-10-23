import { router } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { backend } from '@/backend';
import { Avatar, Option, Segmented, Sheet, SheetLead, SheetTitle } from '@/components/kit';
import { BACKGROUNDS, Background, Panel, PrimaryButton, Txt } from '@/components/ui';
import type { MyStatus } from '@/data/types';
import { useI18n, type Lang } from '@/i18n';
import { useElo } from '@/store';
import { colors, fonts, radius } from '@/theme';

function Item({ label, hint, right, danger, onPress }: { label: string; hint?: string; right?: ReactNode; danger?: boolean; onPress?: () => void }) {
  return (
    <Pressable disabled={!onPress} onPress={onPress} style={({ pressed }) => [styles.item, pressed && { opacity: 0.6 }]} accessibilityRole={onPress ? 'button' : undefined}>
      <View style={{ flex: 1 }}>
        <Txt style={[styles.itemText, danger && { color: colors.coral }]}>{label}</Txt>
        {hint ? <Txt variant="small">{hint}</Txt> : null}
      </View>
      {right}
    </Pressable>
  );
}

type InfoKey = 'rules' | 'help';

export default function Settings() {
  const { t } = useI18n();
  const { profile, prefs, blocked, mode, actions } = useElo();
  const insets = useSafeAreaInsets();
  const [info, setInfo] = useState<InfoKey | null>(null);
  const [blockedOpen, setBlockedOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [admin, setAdmin] = useState(false);
  useEffect(() => { backend.isAdmin().then(setAdmin).catch(() => {}); }, []);

  return (
    <View style={{ flex: 1 }}>
      <Background source={BACKGROUNDS.chat} veil={0.6} />
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 16, paddingHorizontal: 16, paddingBottom: 30 }}>
        <Txt variant="title" center>{t.settings.title}</Txt>

        <Panel style={styles.card}>
          <Item label={t.settings.face} onPress={() => router.push('/rosto')}
            right={<View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Avatar index={profile.avatar} size={36} /><Txt variant="small">{t.settings.change}</Txt></View>} />
          <Txt style={[styles.itemText, { marginTop: 12 }]}>{t.settings.status}</Txt>
          <View style={{ marginVertical: 8 }}>
            <Segmented<MyStatus> value={profile.status} onChange={actions.setStatus}
              options={[{ key: 'online', label: t.status.online }, { key: 'ausente', label: t.status.ausente }, { key: 'invisivel', label: t.status.invisivel }]} />
          </View>
          <Txt style={[styles.itemText, { marginTop: 8 }]}>{t.settings.language}</Txt>
          <View style={{ marginTop: 8, marginBottom: 10 }}>
            <Segmented<Lang> value={profile.lang} onChange={actions.setLang} options={[{ key: 'pt', label: 'Português' }, { key: 'en', label: 'English' }]} />
          </View>
        </Panel>

        <Panel style={styles.card}>
          <Txt style={[styles.itemText, { marginTop: 12, fontFamily: fonts.bodyBold }]}>{t.settings.prefsTitle}</Txt>
          <Txt variant="small" style={{ marginTop: 2 }}>{t.settings.prefsHint}</Txt>
          <Txt style={[styles.itemText, { marginTop: 12 }]}>{t.settings.genderLabel}</Txt>
          <View style={{ marginVertical: 8 }}>
            <Segmented<'f' | 'm' | 'x'> value={profile.gender ?? 'x'} onChange={actions.setGender}
              options={[{ key: 'f', label: t.settings.gender.f }, { key: 'm', label: t.settings.gender.m }, { key: 'x', label: t.settings.gender.x }]} />
          </View>
          {profile.gender === 'f' ? (
            <Item label={t.settings.womenOnly} right={<Switch value={!!profile.womenOnly} onValueChange={actions.setWomenOnly} trackColor={{ true: colors.teal }} />} />
          ) : <View style={{ height: 8 }} />}
        </Panel>

        <Panel style={styles.card}>
          <Item label={t.settings.sounds} right={<Switch value={prefs.sound} onValueChange={(v) => actions.setPrefs({ sound: v })} trackColor={{ true: colors.teal }} />} />
          <Item label={t.settings.quiet} hint={t.settings.quietHint} right={<Switch value={prefs.quiet} onValueChange={(v) => actions.setPrefs({ quiet: v })} trackColor={{ true: colors.teal }} />} />
          <Item label={t.settings.notifications} right={<Switch value={prefs.notifications} onValueChange={(v) => actions.setPrefs({ notifications: v })} trackColor={{ true: colors.teal }} />} />
        </Panel>

        <Panel style={styles.card}>
          <Item label={t.settings.blocked} onPress={() => setBlockedOpen(true)} right={<Txt variant="small">{blocked.length}</Txt>} />
          <Item label={t.settings.rules} onPress={() => setInfo('rules')} />
          <Item label={t.settings.terms} onPress={() => router.push('/legal/termos')} />
          <Item label={t.settings.privacy} onPress={() => router.push('/legal/privacidade')} />
          <Item label={t.settings.help} onPress={() => setInfo('help')} />
        </Panel>

        {admin ? (
          <Panel style={styles.card}>
            <Item label={t.settings.admin} onPress={() => router.push('/denuncias')} />
          </Panel>
        ) : null}

        <Panel style={styles.card}>
          <Item label={t.settings.logout} onPress={() => actions.logout()} />
          <Item label={t.settings.delete} danger onPress={() => setDeleting(true)} />
        </Panel>

        <Txt variant="small" center style={{ marginTop: 16 }}>{t.settings.footer}</Txt>
        <Txt variant="small" center style={{ marginTop: 4, fontSize: 12 }}>{mode === 'demo' ? t.settings.demoMode : t.settings.liveMode}</Txt>
      </ScrollView>

      <Sheet visible={!!info} onClose={() => setInfo(null)}>
        <SheetTitle>{info ? t.settings[info] : ''}</SheetTitle>
        <SheetLead>{info ? t.info[info] : ''}</SheetLead>
        <PrimaryButton title={t.info.ok} onPress={() => setInfo(null)} />
      </Sheet>

      <Sheet visible={blockedOpen} onClose={() => setBlockedOpen(false)}>
        <SheetTitle>{t.settings.blocked}</SheetTitle>
        {blocked.length === 0 ? <SheetLead>{t.settings.noneBlocked}</SheetLead> : <View style={{ height: 12 }} />}
        {blocked.map((b) => (
          <Option key={b.id} label={b.name} onPress={() => { actions.unblock(b.id); actions.showToast(t.settings.unblocked); }}
            right={<Txt style={{ fontFamily: fonts.bodyBold, color: colors.teal }}>{t.settings.unblock}</Txt>} />
        ))}
      </Sheet>

      <Sheet visible={deleting} onClose={() => setDeleting(false)}>
        <SheetTitle>{t.settings.deleteTitle}</SheetTitle>
        <SheetLead>{t.settings.deleteLead}</SheetLead>
        <View style={{ gap: 10 }}>
          <Pressable style={styles.danger} onPress={async () => { setDeleting(false); await actions.deleteAccount(); actions.showToast(t.settings.deleted); }}>
            <Txt style={styles.dangerText}>{t.settings.deleteConfirm}</Txt>
          </Pressable>
          <PrimaryButton variant="ghost" title={t.cancel} onPress={() => setDeleting(false)} />
        </View>
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginTop: 12, paddingVertical: 4, paddingHorizontal: 16 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.line },
  itemText: { fontFamily: fonts.body, fontSize: 15 },
  danger: { backgroundColor: colors.coral, borderRadius: radius.pill, paddingVertical: 15, alignItems: 'center' },
  dangerText: { fontFamily: fonts.bodyBold, color: '#fff', fontSize: 15 },
});
