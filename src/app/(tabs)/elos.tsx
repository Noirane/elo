import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar, Option, Sheet, SheetLead, SheetTitle } from '@/components/kit';
import { BACKGROUNDS, Panel, Txt } from '@/components/ui';
import type { Elo, MyStatus } from '@/data/types';
import { useI18n } from '@/i18n';
import { formatTime } from '@/lib/time';
import { FREE_NEW_CHAT_LIMIT, useElo } from '@/store';
import { colors, fonts } from '@/theme';

const ORDER = { online: 0, ausente: 1, offline: 2 } as const;
const MY_COLOR: Record<MyStatus, string> = { online: colors.ok, ausente: colors.warn, invisivel: '#B0AAB8' };

function Row({ e, last }: { e: Elo; last: boolean }) {
  const { t, lang } = useI18n();
  const { topicById } = useElo();
  const topic = topicById(e.topicId);
  const msgs = e.items.filter((i) => i.from === 'me' || i.from === 'them');
  const lastMsg = msgs[msgs.length - 1];
  const lastText = !lastMsg ? '' : lastMsg.from !== 'me' && lastMsg.from !== 'them' ? '' : lastMsg.type === 'text' ? lastMsg.text : t.elos.sticker;
  const sub = e.stale ? t.elos.noReply : e.waiting ? t.elos.boatWaiting : lastMsg ? (lastMsg.from === 'me' ? t.elos.you : '') + lastText : '';
  return (
    <Pressable accessibilityRole="button" onPress={() => router.push(`/chat/${e.id}`)}
      style={({ pressed }) => [styles.row, last && { borderBottomWidth: 0 }, pressed && { opacity: 0.6 }]}>
      <Avatar index={e.otherAvatar} size={50} status={e.kind === 'contact' ? e.otherStatus : undefined} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt style={styles.name}>{e.otherNick ?? e.otherName}</Txt>
        {topic ? <Txt style={styles.topic}>{topic.title}</Txt> : null}
        <Txt variant="small" numberOfLines={2}>{sub}</Txt>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 6 }}>
        <Txt variant="small" style={[{ fontSize: 11 }, e.stale && { color: colors.coral, fontFamily: fonts.bodyBold }]}>
          {e.stale ? t.elos.days(3) : lastMsg ? formatTime(lastMsg.at, lang, t.elos.yesterday) : ''}
        </Txt>
        {e.unread ? <View style={styles.badge}><Txt style={styles.badgeText}>{e.unread}</Txt></View> : null}
      </View>
    </Pressable>
  );
}

export default function Elos() {
  const { t } = useI18n();
  const { elos, profile, activeNew, actions } = useElo();
  const insets = useSafeAreaInsets();
  const [statusSheet, setStatusSheet] = useState(false);
  const contacts = elos.filter((e) => e.kind === 'contact').sort((a, b) => ORDER[a.otherStatus] - ORDER[b.otherStatus]);
  const news = elos.filter((e) => e.kind === 'new');
  const online = contacts.filter((c) => c.otherStatus === 'online').length;

  return (
    <View style={{ flex: 1, backgroundColor: colors.paper }}>
      <Image source={BACKGROUNDS.meusElos} style={styles.head} contentFit="cover" />
      <LinearGradient pointerEvents="none" colors={['rgba(251,243,232,0)', 'rgba(251,243,232,0.6)', colors.paper]} locations={[0, 0.55, 1]} style={styles.headFade} />
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 96, paddingHorizontal: 16, paddingBottom: 24 }}>
        <Txt variant="title" center style={{ fontSize: 38, lineHeight: 42 }}>{t.elos.title}</Txt>
        <Pressable onPress={() => setStatusSheet(true)} style={styles.me} accessibilityRole="button">
          <Pressable onPress={() => router.push('/rosto')} hitSlop={8} accessibilityLabel={t.settings.face}>
            <Avatar index={profile.avatar} size={28} />
          </Pressable>
          <Txt style={styles.meText}>{t.elos.youAre}</Txt>
          <View style={[styles.myDot, { backgroundColor: MY_COLOR[profile.status] }]} />
          <Txt style={[styles.meText, { color: colors.teal }]}>{t.status[profile.status]} ▾</Txt>
        </Pressable>

        <Panel style={styles.card}>
          <View style={styles.sect}><Txt variant="label">{t.elos.contacts}</Txt><Txt variant="label">{t.elos.online(online)}</Txt></View>
          {contacts.length ? contacts.map((e, i) => <Row key={e.id} e={e} last={i === contacts.length - 1} />)
            : <Txt variant="small" center style={{ paddingVertical: 12 }}>{t.elos.emptyContacts}</Txt>}
        </Panel>

        <Panel style={styles.card}>
          <View style={styles.sect}><Txt variant="label">{t.elos.newChats}</Txt><Txt variant="label">{t.elos.of(activeNew, FREE_NEW_CHAT_LIMIT)}</Txt></View>
          {news.length ? news.map((e, i) => <Row key={e.id} e={e} last={i === news.length - 1} />)
            : <Txt variant="small" center style={{ paddingVertical: 12 }}>{t.elos.emptyNew}</Txt>}
          {activeNew >= FREE_NEW_CHAT_LIMIT ? <View style={styles.limit}><Txt variant="small" center>{t.elos.limit}</Txt></View> : null}
        </Panel>
      </ScrollView>

      <Sheet visible={statusSheet} onClose={() => setStatusSheet(false)}>
        <SheetTitle>{t.settings.status}</SheetTitle>
        <SheetLead>{t.status.hint}</SheetLead>
        {(['online', 'ausente', 'invisivel'] as MyStatus[]).map((k) => (
          <Option key={k} label={t.status[k]} onPress={() => { actions.setStatus(k); setStatusSheet(false); }}
            icon={<View style={[styles.myDot, { backgroundColor: MY_COLOR[k], width: 12, height: 12 }]} />}
            right={profile.status === k ? <Txt style={{ color: colors.teal, fontFamily: fonts.bodyBold }}>✓</Txt> : undefined} />
        ))}
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { position: 'absolute', top: 0, left: 0, right: 0, height: 240, opacity: 0.8 },
  headFade: { position: 'absolute', top: 60, left: 0, right: 0, height: 182 },
  me: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'center', marginTop: 6, backgroundColor: colors.veil, borderRadius: 999, paddingVertical: 5, paddingLeft: 5, paddingRight: 12 },
  meText: { fontFamily: fonts.bodyBold, fontSize: 13 },
  myDot: { width: 9, height: 9, borderRadius: 6 },
  card: { marginTop: 12, paddingVertical: 8, paddingHorizontal: 14 },
  sect: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4, marginBottom: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: colors.line },
  name: { fontFamily: fonts.bodyBold, fontSize: 14.5, lineHeight: 19 },
  topic: { fontFamily: fonts.bodyBold, fontSize: 11.5, color: colors.teal },
  badge: { backgroundColor: colors.coral, borderRadius: 9, paddingHorizontal: 6, minWidth: 18, alignItems: 'center' },
  badgeText: { fontFamily: fonts.bodyBold, fontSize: 10, color: '#fff', lineHeight: 16 },
  limit: { borderWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(30,100,117,0.4)', borderRadius: 14, padding: 11, marginTop: 8, marginBottom: 4 },
});
