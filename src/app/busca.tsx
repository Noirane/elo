import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Back } from '@/components/icons';
import { Field } from '@/components/kit';
import { PrimaryButton, RoundButton, Txt } from '@/components/ui';
import { ISLAND_IMAGES } from '@/data/mock';
import { useI18n } from '@/i18n';
import { ALIASES, normalizeTitle } from '@/lib/topics';
import { useElo } from '@/store';
import { colors, fonts } from '@/theme';

export default function SearchScreen() {
  const { t } = useI18n();
  const { topics } = useElo();
  const insets = useSafeAreaInsets();
  const [q, setQ] = useState('');

  const results = useMemo(() => {
    const n = normalizeTitle(q);
    return [...topics].sort((a, b) => b.popularity - a.popularity).filter((x) => !n || normalizeTitle(x.title).includes(n) || (ALIASES[x.title] ?? []).some((a) => a.includes(n))).slice(0, 30);
  }, [q, topics]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.paper, paddingTop: insets.top + 10 }}>
      <View style={styles.head}>
        <RoundButton label={t.back} onPress={() => router.back()}><Back color={colors.ink} /></RoundButton>
        <Txt variant="title" style={{ fontSize: 28 }}>{t.search.title}</Txt>
      </View>
      <View style={{ paddingHorizontal: 16, marginTop: 12 }}>
        <Field value={q} onChangeText={setQ} placeholder={t.search.placeholder} autoFocus autoCorrect={false} returnKeyType="search" />
      </View>
      <FlatList
        data={results}
        keyExtractor={(x) => x.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}
        ListEmptyComponent={
          <View style={{ gap: 14, paddingTop: 10 }}>
            <Txt variant="small" center>{t.search.none}</Txt>
            {q.trim().length >= 3 ? <PrimaryButton title={t.search.create(q.trim())} onPress={() => router.replace({ pathname: '/criar', params: { title: q.trim() } })} /> : null}
          </View>
        }
        renderItem={({ item }) => (
          <Pressable accessibilityRole="button" style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}
            onPress={() => router.replace(`/topico/${item.id}`)}>
            <Image source={ISLAND_IMAGES[item.category]} style={{ width: 40, height: 40 }} />
            <View style={{ flex: 1 }}>
              <Txt style={styles.title}>{item.title}</Txt>
              <Txt variant="small">{t.categories[item.category]}</Txt>
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.line },
  title: { fontFamily: fonts.display, fontSize: 19, lineHeight: 22 },
});
