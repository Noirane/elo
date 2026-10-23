import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BACKGROUNDS, PrimaryButton, Txt } from '@/components/ui';
import { useI18n } from '@/i18n';
import { useElo } from '@/store';
import { colors, fonts } from '@/theme';

const IMAGES = [BACKGROUNDS.onboarding1, BACKGROUNDS.match, BACKGROUNDS.onboarding3];

export default function Intro() {
  const { t } = useI18n();
  const { actions } = useElo();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState(0);
  const [accepted, setAccepted] = useState(false);
  const slide = t.entry.slides[step];
  const last = step === 2;

  const next = async () => {
    if (!last) return setStep(step + 1);
    if (!accepted) return;
    await actions.finishOnboarding();
    router.replace('/');
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.paper }}>
      <Image source={IMAGES[step]} style={StyleSheet.absoluteFill} contentFit="cover" transition={250} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 22 }]}>
        <ScrollView contentContainerStyle={{ alignItems: 'center' }} bounces={false}>
          <View style={styles.dots}>{[0, 1, 2].map((i) => <View key={i} style={[styles.dot, i === step && styles.dotOn]} />)}</View>
          <Txt variant="title" center style={{ fontSize: 31, lineHeight: 35 }}>{slide.title}</Txt>
          {slide.text ? <Txt center style={{ marginTop: 10 }}>{slide.text}</Txt> : null}
          {last ? (
            <View style={{ alignSelf: 'stretch', marginTop: 14, gap: 10 }}>
              {t.entry.rules.map((r, i) => (
                <View key={i} style={styles.rule}><View style={styles.bullet} /><Txt style={{ flex: 1, fontSize: 14 }}>{r}</Txt></View>
              ))}
              <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: accepted }} onPress={() => setAccepted(!accepted)} style={styles.check}>
                <View style={[styles.box, accepted && styles.boxOn]}>{accepted ? <Txt style={styles.tick}>✓</Txt> : null}</View>
                <Txt style={{ flex: 1, fontSize: 13.5 }}>{t.entry.accept}</Txt>
              </Pressable>
              <View style={styles.links}>
                <Pressable onPress={() => router.push('/legal/termos')} hitSlop={8}><Txt style={styles.link}>{t.entry.readTerms}</Txt></Pressable>
                <Pressable onPress={() => router.push('/legal/privacidade')} hitSlop={8}><Txt style={styles.link}>{t.entry.readPrivacy}</Txt></Pressable>
              </View>
            </View>
          ) : null}
        </ScrollView>
        <View style={{ marginTop: 16, opacity: last && !accepted ? 0.45 : 1 }}>
          <PrimaryButton title={last ? t.entry.enter : t.next} onPress={next} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '68%', backgroundColor: colors.paper, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: 22, paddingHorizontal: 22 },
  dots: { flexDirection: 'row', gap: 7, marginBottom: 14 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.line },
  dotOn: { width: 20, backgroundColor: colors.teal },
  rule: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  bullet: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.teal, marginTop: 7 },
  check: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 6, paddingVertical: 6 },
  box: { width: 24, height: 24, borderRadius: 7, borderWidth: 2, borderColor: colors.teal, alignItems: 'center', justifyContent: 'center' },
  boxOn: { backgroundColor: colors.teal },
  links: { alignItems: 'center', gap: 8, marginTop: 2 },
  link: { fontFamily: fonts.bodyBold, fontSize: 13.5, color: colors.teal, textDecorationLine: 'underline' },
  tick: { color: '#fff', fontFamily: fonts.bodyBold, fontSize: 14, lineHeight: 18 },
});
