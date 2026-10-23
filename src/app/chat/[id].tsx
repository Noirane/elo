import { Image } from 'expo-image';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Arrow, Back } from '@/components/icons';
import { Ban, Bell, Door, Flag, Leaf, Lock, More, Mute, Smile, Wind } from '@/components/icons2';
import { Avatar, Field, Option, Sheet, SheetLead, SheetTitle, StickerView, type FieldRef } from '@/components/kit';
import { BACKGROUNDS, Background, Panel, PrimaryButton, Txt } from '@/components/ui';
import { STICKER_PACK } from '@/data/content';
import { ISLAND_IMAGES } from '@/data/mock';
import type { ChatItem, MsgPayload } from '@/data/types';
import type { ReportReason } from '@/backend/types';
import { useI18n } from '@/i18n';
import { formatTime } from '@/lib/time';
import { useElo, type SendResult } from '@/store';
import { colors, fonts, radius } from '@/theme';

type SheetName = null | 'menu' | 'report' | 'block' | 'undo' | 'end';

function Bubble({ item, onReact, lang, yesterday }: { item: ChatItem; onReact: (id: string) => void; lang: 'pt' | 'en'; yesterday: string }) {
  const last = useRef(0);
  if (item.from === 'sys') {
    return <View style={styles.sys}><Txt variant="small" center style={{ fontSize: 12 }}>{item.text}</Txt></View>;
  }
  if (item.from === 'care') return null;
  const mine = item.from === 'me';
  const time = formatTime(item.at, lang, yesterday);
  const tap = () => {
    const now = Date.now();
    if (now - last.current < 320) onReact(item.id);
    last.current = now;
  };
  if (item.type !== 'text') {
    return (
      <Pressable onPress={tap} onLongPress={() => onReact(item.id)} style={[styles.stickerWrap, mine ? styles.right : styles.left]}>
        <StickerView payload={item} size={132} />
        <Txt style={[styles.time, { color: colors.muted, alignSelf: mine ? 'flex-end' : 'flex-start' }]}>{time}</Txt>
        {item.reaction ? <View style={[styles.leaf, mine ? { left: -4 } : { right: -4 }]}><Leaf size={14} /></View> : null}
      </Pressable>
    );
  }
  return (
    <Pressable onPress={tap} onLongPress={() => onReact(item.id)} accessibilityHint="reação"
      style={[styles.bubble, mine ? [styles.right, styles.me] : [styles.left, styles.them]]}>
      <Txt style={{ color: mine ? colors.bubbleMeInk : colors.bubbleThemInk, fontSize: 15, lineHeight: 21 }}>{item.text}</Txt>
      <Txt style={[styles.time, { color: mine ? colors.bubbleMeInk : colors.bubbleThemInk }]}>{time}</Txt>
      {item.reaction ? <View style={[styles.leaf, mine ? { left: -6 } : { right: -6 }]}><Leaf size={14} /></View> : null}
    </Pressable>
  );
}

function CareCard({ t }: { t: ReturnType<typeof useI18n>['t'] }) {
  return (
    <View style={styles.care}>
      <Txt style={{ fontFamily: fonts.bodyBold }}>{t.chat.careTitle}</Txt>
      <Txt style={{ fontSize: 13.5, marginTop: 4 }}>{t.chat.careText}</Txt>
    </View>
  );
}

/** Só as figurinhas do Elo: nada criado por usuários, para não abrir espaço para conteúdo ofensivo. */
function StickerTray({ onSend }: { onSend: (p: MsgPayload) => void }) {
  const { t } = useI18n();
  return (
    <View style={styles.tray}>
      <Txt variant="label" center style={{ marginBottom: 6 }}>{t.stickers.pack}</Txt>
      <View style={styles.grid}>
        {STICKER_PACK.map((s) => (
          <Pressable key={s.key} style={styles.cell} onPress={() => onSend({ type: 'sticker', sticker: s.key })} accessibilityLabel={s.label}>
            <Image source={s.source} style={{ width: '100%', aspectRatio: 1 }} contentFit="contain" />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export default function Chat() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, lang } = useI18n();
  const { elos, typing, topicById, actions, profile } = useElo();
  const insets = useSafeAreaInsets();
  const elo = elos.find((e) => e.id === id);
  const topic = elo ? topicById(elo.topicId) : undefined;
  const [text, setText] = useState('');
  const [sheet, setSheet] = useState<SheetName>(null);
  const [tray, setTray] = useState(false);
  const [reason, setReason] = useState<ReportReason>('assedio');
  const [note, setNote] = useState('');
  const [reporting, setReporting] = useState(false);
  const [keepState, setKeepState] = useState<'ask' | 'waiting' | 'kept'>('ask');
  const [keptNick, setKeptNick] = useState('');
  const list = useRef<FlatList<ChatItem>>(null);
  const input = useRef<FieldRef>(null);

  useFocusEffect(useCallback(() => {
    actions.setOpenChat(id);
    return () => { actions.typing(id, false); actions.setOpenChat(null); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]));

  useEffect(() => { setTimeout(() => list.current?.scrollToEnd({ animated: true }), 60); }, [elo?.items.length, typing[id]]);

  if (!elo) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.paper }}>
        <PrimaryButton title={t.back} onPress={() => router.back()} />
      </View>
    );
  }

  const name = elo.otherNick ?? elo.otherName;
  const isTyping = !!typing[elo.id];

  if (elo.stale) {
    return (
      <View style={{ flex: 1 }}>
        <Background source={BACKGROUNDS.desfeito} veil={0.25} />
        <Panel style={{ position: 'absolute', top: insets.top + 72, left: 20, right: 20, alignItems: 'center', paddingVertical: 24 }}>
          <Txt variant="title" center>{t.stale.title}</Txt>
          <Txt center style={{ marginTop: 10 }}>{t.stale.text(elo.otherName)}</Txt>
        </Panel>
        <View style={{ position: 'absolute', left: 20, right: 20, bottom: insets.bottom + 28 }}>
          <PrimaryButton title={t.stale.explore} onPress={() => { actions.dismissStale(elo.id); router.dismissAll(); router.navigate('/'); }} />
        </View>
      </View>
    );
  }

  const status = isTyping ? t.chat.typing
    : elo.kind === 'new' && elo.waiting ? t.chat.waiting
    : elo.otherStatus === 'online' ? t.chat.onlineNow : elo.otherStatus === 'ausente' ? t.chat.away : t.chat.offline;

  const handleResult = (r: SendResult) => {
    if (r === 'contact') actions.showToast(t.chat.blockedContact);
    else if (r === 'offensive') actions.showToast(t.chat.blockedOffensive);
    else if (r === 'image-contacts-only') actions.showToast(t.chat.imageContactsOnly);
    else if (r === 'error') actions.showToast(t.chat.sendError);
    return r === 'ok';
  };

  const sendText = async () => {
    const v = text.trim();
    if (!v) return;
    if (handleResult(await actions.send(elo.id, { type: 'text', text: v }))) { setText(''); actions.typing(elo.id, false); }
  };
  const sendSticker = async (p: MsgPayload) => {
    if (handleResult(await actions.send(elo.id, p))) setTray(false);
  };
  const wind = async () => {
    const left = actions.windLeft(elo.id);
    if (left > 0) return actions.showToast(t.chat.windWait(Math.ceil(left / 60000)));
    await actions.sendWind(elo.id);
  };

  const header = elo.kind === 'new'
    ? <View style={styles.note}><Lock color={colors.muted} /><Txt variant="small" style={{ fontSize: 12, flexShrink: 1 }}>{t.chat.lockNote}</Txt></View>
    : <View style={styles.note}><Txt variant="small" center style={{ fontSize: 12 }}>{topic ? t.chat.metAt(t.categories[topic.category], topic.title) : ''}</Txt></View>;

  const closeSheet = () => { setSheet(null); setKeepState('ask'); };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Background source={BACKGROUNDS.chat} veil={0.6} />
      {topic ? <Image source={ISLAND_IMAGES[topic.category]} style={styles.island} contentFit="contain" /> : null}

      <View style={[styles.head, { paddingTop: insets.top + 6 }]}>
        <Pressable onPress={() => router.back()} hitSlop={10} accessibilityLabel={t.back} style={styles.iconBtn}><Back color={colors.ink} /></Pressable>
        <Avatar index={elo.otherAvatar} size={40} status={elo.kind === 'contact' ? elo.otherStatus : undefined} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt style={styles.name}>{name}</Txt>
          <Txt style={[styles.status, isTyping && { color: colors.teal, fontStyle: 'italic' }]}>{status}</Txt>
        </View>
        {elo.kind === 'new' && !elo.waiting ? (
          <Pressable onPress={() => setSheet('end')} accessibilityRole="button" style={styles.keepPill}>
            <Txt style={styles.keepPillText}>{t.keep.keep}</Txt>
          </Pressable>
        ) : null}
        <Pressable onPress={() => setSheet('report')} hitSlop={8} accessibilityLabel={t.menu.report} style={styles.iconBtn}><Flag color={colors.muted} /></Pressable>
        <Pressable onPress={() => setSheet('menu')} hitSlop={8} accessibilityLabel="Menu" style={styles.iconBtn}><More color={colors.ink} /></Pressable>
      </View>

      <FlatList
        ref={list}
        data={elo.items}
        keyExtractor={(x) => x.id}
        ListHeaderComponent={header}
        ListFooterComponent={isTyping ? <View style={[styles.bubble, styles.left, styles.them, { paddingBottom: 10 }]}><Txt style={{ color: colors.muted }}>{t.chat.typing}</Txt></View> : undefined}
        contentContainerStyle={{ padding: 14, gap: 9 }}
        keyboardShouldPersistTaps="handled"
        onTouchStart={() => { if (tray) setTray(false); }}
        onContentSizeChange={() => list.current?.scrollToEnd({ animated: false })}
        renderItem={({ item }) => item.from === 'care' ? <CareCard t={t} /> : <Bubble item={item} lang={lang} yesterday={t.elos.yesterday} onReact={(mid) => actions.toggleReaction(elo.id, mid)} />}
      />

      {tray ? <StickerTray onSend={sendSticker} /> : null}

      <View style={[styles.bar, { paddingBottom: insets.bottom + 10 }]}>
        <Pressable onPress={wind} style={styles.tool} accessibilityLabel={t.chat.windLabel}><Wind color={colors.teal} /></Pressable>
        {lang === 'pt' ? (
          <Pressable onPress={() => setTray(!tray)} style={[styles.tool, tray && { backgroundColor: colors.tealSoft }]} accessibilityLabel={t.chat.stickersLabel}><Smile color={colors.teal} /></Pressable>
        ) : null}
        <Field ref={input} value={text} onChangeText={(v) => { setText(v); actions.typing(elo.id, v.length > 0); }} placeholder={t.chat.placeholder} style={styles.input} multiline maxLength={1000}
          onFocus={() => setTray(false)} />
        <Pressable onPress={sendText} style={styles.send} accessibilityLabel="Enviar"><Arrow size={22} color="#fff" /></Pressable>
      </View>


      <Sheet visible={sheet === 'menu'} onClose={closeSheet}>
        {elo.kind === 'contact' ? (
          <Option icon={<Bell color={colors.ink} />} label={t.menu.notifyArrival(name)} onPress={() => actions.toggleArrival(elo.id)}
            right={<Txt style={{ fontFamily: fonts.bodyBold, color: elo.notifyArrival ? colors.teal : colors.muted }}>{elo.notifyArrival ? 'ON' : 'OFF'}</Txt>} />
        ) : null}
        <Option icon={<Mute color={colors.ink} />} label={t.menu.muteWind} onPress={() => actions.toggleWindMute(elo.id)}
          right={<Txt style={{ fontFamily: fonts.bodyBold, color: elo.windMuted ? colors.teal : colors.muted }}>{elo.windMuted ? 'ON' : 'OFF'}</Txt>} />
        {elo.kind === 'contact'
          ? <Option icon={<Door color={colors.ink} />} label={t.menu.undo} onPress={() => setSheet('undo')} />
          : <><Option icon={<Leaf size={20} />} label={t.keep.keep} onPress={() => setSheet('end')} /><Option icon={<Door color={colors.ink} />} label={t.menu.end} onPress={() => setSheet('end')} /></>}
        <Option icon={<Flag color={colors.ink} />} label={t.menu.report} onPress={() => setSheet('report')} />
        <Option icon={<Ban color={colors.coral} />} label={t.menu.block(name)} danger onPress={() => setSheet('block')} />
      </Sheet>

      <Sheet visible={sheet === 'report'} onClose={closeSheet}>
        <SheetTitle>{t.report.title}</SheetTitle>
        <SheetLead>{t.report.lead(name)}</SheetLead>
        {(Object.keys(t.report.reasons) as ReportReason[]).map((k) => (
          <Option key={k} label={t.report.reasons[k]} onPress={() => setReason(k)}
            icon={<View style={[styles.radio, reason === k && styles.radioOn]} />} />
        ))}
        <Txt variant="label" style={{ marginTop: 14, marginBottom: 6 }}>{t.report.noteLabel}</Txt>
        <Field value={note} onChangeText={setNote} placeholder={t.report.notePlaceholder} multiline maxLength={500}
          style={{ minHeight: 70, textAlignVertical: 'top' }} />
        <View style={{ height: 14 }} />
        {reporting ? <ActivityIndicator color={colors.teal} /> : (
          <PrimaryButton title={t.report.send} onPress={async () => {
            setReporting(true);
            try {
              await actions.report(elo.id, reason, note);
              setSheet(null); actions.showToast(t.report.done); router.back();
            } catch {
              actions.showToast(t.chat.sendError);
            } finally {
              setReporting(false);
            }
          }} />
        )}
      </Sheet>

      <Sheet visible={sheet === 'block'} onClose={closeSheet}>
        <SheetTitle>{t.block.title}</SheetTitle>
        <SheetLead>{t.block.lead(name)}</SheetLead>
        <View style={{ gap: 10 }}>
          <Pressable style={styles.danger} onPress={async () => { await actions.block(elo.id); setSheet(null); actions.showToast(t.block.done); router.back(); }}>
            <Txt style={styles.dangerText}>{t.block.confirm}</Txt>
          </Pressable>
          <PrimaryButton variant="ghost" title={t.cancel} onPress={closeSheet} />
        </View>
      </Sheet>

      <Sheet visible={sheet === 'undo'} onClose={closeSheet}>
        <SheetTitle>{t.undo.title}</SheetTitle>
        <SheetLead>{t.undo.lead(name)}</SheetLead>
        <View style={{ gap: 10 }}>
          <PrimaryButton title={t.undo.confirm} onPress={async () => { await actions.undo(elo.id); setSheet(null); actions.showToast(t.undo.done(name)); router.back(); }} />
          <PrimaryButton variant="ghost" title={t.cancel} onPress={closeSheet} />
        </View>
        <Txt variant="small" center style={{ marginTop: 14 }}>{t.undo.hint}</Txt>
      </Sheet>

      <Sheet visible={sheet === 'end'} onClose={keepState === 'waiting' ? () => {} : closeSheet}>
        {keepState === 'ask' ? (
          <>
            <View style={styles.pair}><Avatar index={profile.avatar} size={62} /><View style={{ marginLeft: -14 }}><Avatar index={elo.otherAvatar} size={62} /></View></View>
            <SheetTitle>{t.keep.title}</SheetTitle>
            <SheetLead>{t.keep.lead(elo.otherName)}</SheetLead>
            <View style={{ gap: 10 }}>
              <PrimaryButton title={t.keep.keep} onPress={async () => {
                setKeepState('waiting');
                const r = await actions.keep(elo.id);
                if (!r.kept) { closeSheet(); actions.showToast(t.keep.pending(elo.otherName)); return; }
                setKeptNick(r.otherNick ?? '');
                setKeepState('kept');
              }} />
              <PrimaryButton variant="ghost" title={t.keep.letGo} onPress={async () => { await actions.letGo(elo.id); setSheet(null); actions.showToast(t.keep.letGoDone); router.back(); }} />
            </View>
          </>
        ) : keepState === 'waiting' ? (
          <View style={{ alignItems: 'center', paddingVertical: 20 }}>
            <SheetTitle>{t.keep.waitingTitle}</SheetTitle>
            <SheetLead>{t.keep.waitingLead(elo.otherName)}</SheetLead>
            <ActivityIndicator color={colors.teal} />
          </View>
        ) : (
          <>
            <SheetTitle>{t.keep.keptTitle}</SheetTitle>
            <SheetLead>{t.keep.keptLead(elo.otherName, keptNick)}</SheetLead>
            <PrimaryButton title={t.keep.goElos} onPress={() => { closeSheet(); actions.showToast(t.keep.keptToast(keptNick)); router.dismissAll(); router.navigate('/elos'); }} />
          </>
        )}
      </Sheet>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  island: { position: 'absolute', alignSelf: 'center', top: '30%', width: '72%', aspectRatio: 1, opacity: 0.18 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 8, paddingBottom: 8, backgroundColor: 'rgba(251,243,232,0.97)', borderBottomWidth: 1, borderBottomColor: colors.line },
  iconBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  name: { fontFamily: fonts.bodyBold, fontSize: 15, lineHeight: 19 },
  status: { fontFamily: fonts.body, fontSize: 12, color: colors.muted },
  note: { flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', backgroundColor: 'rgba(255,253,249,0.95)', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 7, maxWidth: '94%', marginBottom: 4 },
  sys: { alignSelf: 'center', backgroundColor: 'rgba(255,253,249,0.95)', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 6, maxWidth: '92%' },
  bubble: { maxWidth: '80%', borderRadius: 18, paddingHorizontal: 13, paddingTop: 9, paddingBottom: 6 },
  left: { alignSelf: 'flex-start' },
  right: { alignSelf: 'flex-end' },
  me: { backgroundColor: colors.bubbleMe, borderBottomRightRadius: 6 },
  them: { backgroundColor: colors.bubbleThem, borderBottomLeftRadius: 6 },
  time: { fontFamily: fonts.body, fontSize: 10, opacity: 0.7, alignSelf: 'flex-end', marginTop: 2 },
  leaf: { position: 'absolute', bottom: -8, width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', elevation: 2, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 3 },
  stickerWrap: { maxWidth: '60%' },
  keepPill: { backgroundColor: colors.teal, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  keepPillText: { fontFamily: fonts.bodyBold, fontSize: 12.5, color: '#fff' },
  care: { backgroundColor: '#fff', borderRadius: 16, padding: 13, borderWidth: 1, borderColor: colors.line },
  bar: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, paddingHorizontal: 8, paddingTop: 8, backgroundColor: 'rgba(251,243,232,0.98)', borderTopWidth: 1, borderTopColor: colors.line },
  tool: { width: 40, height: 44, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  input: { flex: 1, minWidth: 0, maxHeight: 120, borderRadius: 22, paddingVertical: 11 },
  send: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.teal, alignItems: 'center', justifyContent: 'center' },
  tray: { backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: colors.line, maxHeight: 320, paddingBottom: 4 },
  trayTabs: { flexDirection: 'row', gap: 6, padding: 8, flexWrap: 'wrap' },
  trayTab: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.pill, backgroundColor: colors.paper2 },
  trayTabOn: { backgroundColor: colors.teal },
  trayTabText: { fontFamily: fonts.bodyBold, fontSize: 12.5, color: colors.muted },
  trayAdd: { paddingHorizontal: 10, paddingVertical: 7, marginLeft: 'auto' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 6 },
  cell: { width: '25%', padding: 5, alignItems: 'center', justifyContent: 'center' },
  pair: { flexDirection: 'row', justifyContent: 'center', marginBottom: 12 },
  radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: colors.teal },
  radioOn: { backgroundColor: colors.teal },
  danger: { backgroundColor: colors.coral, borderRadius: radius.pill, paddingVertical: 15, alignItems: 'center' },
  dangerText: { fontFamily: fonts.bodyBold, color: '#fff', fontSize: 15 },
});
