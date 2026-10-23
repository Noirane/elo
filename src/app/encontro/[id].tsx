import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';

import { Field } from '@/components/kit';
import { BACKGROUNDS, Background, BackButton, Fade, Panel, PrimaryButton, SITTING, Txt } from '@/components/ui';
import type { Elo } from '@/data/types';
import { useI18n } from '@/i18n';
import { play } from '@/lib/feedback';
import { useElo } from '@/store';
import { colors, fonts } from '@/theme';

type Phase = 'searching' | 'live' | 'boat' | 'limit';

function Spinner() {
  const r = useSharedValue(0);
  useEffect(() => { r.value = withRepeat(withTiming(360, { duration: 1400, easing: Easing.linear }), -1); }, [r]);
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${r.value}deg` }] }));
  return (
    <Animated.View style={[{ width: 108, height: 108, alignSelf: 'center' }, style]}>
      <Svg width={108} height={108} viewBox="0 0 110 110">
        <Circle cx={55} cy={55} r={48} stroke="rgba(30,100,117,0.16)" strokeWidth={3} fill="none" />
        <Path d="M55 7a48 48 0 0 1 46 62" stroke={colors.teal} strokeWidth={3} fill="none" strokeLinecap="round" />
      </Svg>
    </Animated.View>
  );
}

function PaperBoat() {
  const x = useSharedValue(-10);
  useEffect(() => { x.value = withRepeat(withTiming(10, { duration: 2000, easing: Easing.inOut(Easing.sin) }), -1, true); }, [x]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }, { rotate: `${x.value * 0.3}deg` }] }));
  return (
    <Animated.View style={[{ alignSelf: 'center' }, style]}>
      <Svg width={118} height={80} viewBox="0 0 120 80">
        <Path d="M10 50h100L92 70H28z" fill="#fff" stroke="#8597A8" strokeWidth={1.5} />
        <Path d="M60 8v42L30 50z" fill="#fff" stroke="#8597A8" strokeWidth={1.5} />
        <Path d="M60 14l26 36H60z" fill="#F4E1D6" stroke="#8597A8" strokeWidth={1.5} />
        <Path d="M4 76c18-6 36 6 56 0s38 6 56 0" stroke="#7FA3B8" strokeWidth={1.5} fill="none" />
      </Svg>
    </Animated.View>
  );
}

export default function Encounter() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useI18n();
  const { topicById, actions } = useElo();
  const insets = useSafeAreaInsets();
  const topic = topicById(id);
  const [phase, setPhase] = useState<Phase>(() => (actions.canStartNew() ? 'searching' : 'limit'));
  const [elo, setElo] = useState<Elo | null>(null);
  const [text, setText] = useState('');
  const [err, setErr] = useState('');
  const [sending, setSending] = useState(false);
  const [boatFound, setBoatFound] = useState(false);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    if (phase !== 'searching' || !topic) return;
    actions.findMatch(topic).then((r) => {
      if (!alive.current) return;
      if (r.result === 'live' && r.elo) { setElo(r.elo); setBoatFound(!!r.boatFound); setPhase('live'); play('vento'); }
      else if (r.result === 'boat' && r.elo) { setElo(r.elo); setPhase('boat'); }
      else setPhase('boat'); // ninguém por perto: o barquinho fica esperando no tópico
    });
    return () => { alive.current = false; actions.cancelMatch(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!topic) return null;

  const startChat = () => {
    if (!elo) return;
    actions.addElo(elo);
    router.replace(`/chat/${elo.id}`);
  };

  const sendBoat = async () => {
    if (sending) return;
    const v = text.trim();
    if (!v) return setErr(t.match.boatEmpty);
    setSending(true);
    // chega direto a quem passou por aqui nas últimas 48h, ou fica esperando no tópico
    const r = elo ? await actions.addEloWithMessage(elo, v) : await actions.leaveBoat(topic, v);
    setSending(false);
    if (r === 'contact') return setErr(t.chat.blockedContact);
    if (r === 'offensive') return setErr(t.chat.blockedOffensive);
    if (r === 'error') return setErr(t.chat.sendError);
    const delivered = !!elo || r === 'delivered';
    actions.showToast(delivered ? t.match.boatSent : t.match.boatLeft);
    router.dismissAll();
    router.navigate(delivered ? '/elos' : '/');
  };

  if (phase === 'limit') {
    return (
      <View style={{ flex: 1 }}>
        <Background source={BACKGROUNDS.chat} veil={0.5} />
        <BackButton label={t.back} onPress={() => router.back()} />
        <Panel style={[styles.topPanel, { top: insets.top + 90 }]}>
          <Txt variant="title" center>{t.match.limitTitle}</Txt>
          <Txt center style={{ marginTop: 10 }}>{t.match.limitText}</Txt>
        </Panel>
        <View style={[styles.bottom, { bottom: insets.bottom + 24 }]}>
          <PrimaryButton title={t.match.seeElos} onPress={() => { router.dismissAll(); router.navigate('/elos'); }} />
        </View>
      </View>
    );
  }

  if (phase === 'searching') {
    return (
      <View style={{ flex: 1 }}>
        <Background source={BACKGROUNDS.chat} veil={0.3} />
        <View style={{ paddingTop: insets.top + 70, paddingHorizontal: 20 }}>
          <Spinner />
          <Panel style={{ marginTop: 22, alignItems: 'center' }}>
            <Txt variant="title" center style={{ fontSize: 27, lineHeight: 32 }}>{t.match.searching}</Txt>
            <Txt center style={{ marginTop: 8, fontFamily: fonts.bodyBold, color: colors.teal }}>{topic.title}</Txt>
          </Panel>
        </View>
        <Image source={SITTING} style={styles.sitting} contentFit="contain" />
        <View style={[styles.bottom, { bottom: insets.bottom + 20 }]}>
          <PrimaryButton variant="ghost" title={t.cancel} onPress={() => router.back()} />
        </View>
      </View>
    );
  }

  if (phase === 'live') {
    return (
      <View style={{ flex: 1 }}>
        <Background source={BACKGROUNDS.match} veil={0.12} />
        <Fade edge="top" height="42%" strength={0.8} />
        <Fade edge="bottom" height="22%" strength={0.7} />
        <Txt variant="title" center style={[styles.formed, { top: insets.top + 70 }]}>{boatFound ? t.match.formedBoat : t.match.formed}</Txt>
        <View style={[styles.bottom, { bottom: insets.bottom + 28 }]}>
          <PrimaryButton title={t.match.start} onPress={startChat} />
        </View>
      </View>
    );
  }

  // barquinho
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Background source={BACKGROUNDS.chat} veil={0.45} />
      <BackButton label={t.back} onPress={() => router.back()} />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, justifyContent: 'flex-end', paddingTop: insets.top + 70, paddingHorizontal: 20, paddingBottom: insets.bottom + 20 }}>
        <PaperBoat />
        <Panel style={{ marginTop: 20, alignItems: 'stretch' }}>
          <Txt variant="title" center style={{ fontSize: 28 }}>{t.match.boatTitle}</Txt>
          <Txt center style={{ marginTop: 8, marginBottom: 12, fontSize: 14 }}>{t.match.boatText(topic.title)}</Txt>
          <Field value={text} onChangeText={(v) => { setText(v); setErr(''); }} placeholder={t.match.boatPlaceholder} multiline maxLength={500}
            style={{ minHeight: 80, textAlignVertical: 'top', marginTop: 10 }} />
          <Txt style={styles.err}>{err}</Txt>
          {sending ? <ActivityIndicator color={colors.teal} /> : <PrimaryButton title={t.match.boatSend} onPress={sendBoat} />}
        </Panel>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  topPanel: { position: 'absolute', left: 20, right: 20, alignItems: 'center', paddingVertical: 24 },
  bottom: { position: 'absolute', left: 20, right: 20 },
  sitting: { position: 'absolute', left: '-6%', right: '-6%', bottom: 70, height: 300 },
  matchWash: { position: 'absolute', top: 0, left: 0, right: 0, height: '40%', backgroundColor: 'rgba(251,243,232,0.6)' },
  formed: { position: 'absolute', left: 20, right: 20, fontSize: 42, lineHeight: 46 },
  ideaChip: { alignSelf: 'center', backgroundColor: colors.tealSoft, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 },
  ideaText: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.teal },
  err: { color: colors.coral, fontFamily: fonts.bodySemi, fontSize: 13, minHeight: 20, marginVertical: 6, textAlign: 'center' },
});
