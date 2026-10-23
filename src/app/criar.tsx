import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Back } from '@/components/icons';
import { Field } from '@/components/kit';
import { BACKGROUNDS, Background, PrimaryButton, RoundButton, Txt } from '@/components/ui';
import { CATEGORY_KEYS, ISLAND_IMAGES, type CategoryKey } from '@/data/mock';
import { useI18n } from '@/i18n';
import { hasContactInfo, isOffensive } from '@/lib/filters';
import { ALIASES, normalizeTitle, similarTopics } from '@/lib/topics';
import { useElo } from '@/store';
import { colors, fonts, radius } from '@/theme';

export default function CreateTopic() {
  const params = useLocalSearchParams<{ cat?: string; title?: string }>();
  const { t } = useI18n();
  const { topics, actions } = useElo();
  const insets = useSafeAreaInsets();
  const [title, setTitle] = useState(params.title ?? '');
  const [desc, setDesc] = useState('');
  const [cat, setCat] = useState<CategoryKey | null>(CATEGORY_KEYS.includes(params.cat as CategoryKey) ? (params.cat as CategoryKey) : null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const similar = useMemo(() => similarTopics(title, topics, ALIASES), [title, topics]);

  const submit = async () => {
    const v = title.trim().replace(/\s+/g, ' ');
    if (v.length < 3) return setErr(t.create.tooShort);
    if (isOffensive(v) || hasContactInfo(v) || isOffensive(desc) || hasContactInfo(desc)) return setErr(t.create.notAllowed);
    if (topics.some((x) => normalizeTitle(x.title) === normalizeTitle(v))) return setErr(t.create.duplicate);
    if (!cat) return setErr(t.create.pickIsland);
    setBusy(true);
    try {
      const tp = await actions.createTopic(v, cat, desc.trim() || undefined);
      actions.showToast(t.create.created(t.categories[cat]));
      router.replace(`/topico/${tp.id}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Background source={BACKGROUNDS.chat} veil={0.72} />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingTop: insets.top + 12, paddingHorizontal: 20, paddingBottom: insets.bottom + 30 }}>
        <View style={styles.head}>
          <RoundButton label={t.back} onPress={() => router.back()}><Back color={colors.ink} /></RoundButton>
          <Txt variant="title" center style={{ flex: 1, fontSize: 30 }}>{t.create.title}</Txt>
          <View style={{ width: 42 }} />
        </View>

        <Txt variant="label" style={styles.label}>{t.create.nameLabel}</Txt>
        <Field value={title} onChangeText={(v) => { setTitle(v); setErr(''); }} placeholder={t.create.namePlaceholder} maxLength={60} autoCorrect={false} />
        {similar.length ? (
          <View style={styles.sugg}>
            <Txt variant="small" style={{ fontFamily: fonts.bodyBold, paddingHorizontal: 13, paddingTop: 9 }}>{t.create.exists}</Txt>
            {similar.map((s) => (
              <Pressable key={s.id} style={styles.suggRow} onPress={() => router.replace(`/topico/${s.id}`)}>
                <Txt style={{ flex: 1, fontSize: 14 }}>{s.title}</Txt>
              </Pressable>
            ))}
          </View>
        ) : null}
        <Txt style={styles.err}>{err}</Txt>

        <Txt variant="label" style={styles.label}>{t.create.islandLabel}</Txt>
        <View style={styles.cats}>
          {CATEGORY_KEYS.map((k) => (
            <Pressable key={k} accessibilityRole="button" accessibilityState={{ selected: cat === k }} onPress={() => { setCat(k); setErr(''); }}
              style={[styles.cat, cat === k && styles.catOn]}>
              <Image source={ISLAND_IMAGES[k]} style={{ width: 44, height: 44 }} />
              <Txt style={[styles.catText, cat === k && { color: colors.teal }]} numberOfLines={2}>{t.categories[k]}</Txt>
            </Pressable>
          ))}
        </View>

        <Txt variant="label" style={styles.label}>{t.create.descLabel}</Txt>
        <Field value={desc} onChangeText={setDesc} placeholder={t.create.descPlaceholder} maxLength={120} multiline style={{ minHeight: 64, textAlignVertical: 'top' }} />

        <View style={{ marginTop: 20, opacity: busy ? 0.6 : 1 }}><PrimaryButton title={t.create.submit} onPress={submit} /></View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', marginBottom: 18 },
  label: { marginBottom: 8, marginTop: 6 },
  err: { color: colors.coral, fontFamily: fonts.bodySemi, fontSize: 13, minHeight: 20, marginTop: 6 },
  sugg: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: colors.line, marginTop: 8, overflow: 'hidden' },
  suggRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 13, paddingVertical: 11, borderTopWidth: 1, borderTopColor: colors.line },
  cats: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cat: { width: '23%', flexGrow: 1, backgroundColor: '#fff', borderWidth: 1.5, borderColor: colors.line, borderRadius: radius.md, alignItems: 'center', paddingVertical: 6, paddingHorizontal: 2 },
  catOn: { borderColor: colors.teal, backgroundColor: colors.tealSoft },
  catText: { fontFamily: fonts.bodyBold, fontSize: 11, textAlign: 'center', lineHeight: 14 },
});
