import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { useMemo, useState, useCallback } from 'react';
import { FlatList, Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Floating } from '@/components/floating';
import { EloMark, Plus, Search } from '@/components/icons';
import { BACKGROUNDS, Background, RoundButton, Txt } from '@/components/ui';
import { ISLAND_IMAGES, islandStats, type CategoryKey } from '@/data/mock';
import { useElo } from '@/store';
import { useI18n } from '@/i18n';
import { colors, fonts, radius } from '@/theme';

type Stat = ReturnType<typeof islandStats>[number];

export default function Home() {
  const { t } = useI18n();
  const { topics, refreshTopics } = useElo();
  useFocusEffect(useCallback(() => { refreshTopics(); }, [refreshTopics]));
  const insets = useSafeAreaInsets();
  const [page, setPage] = useState(0);
  const [area, setArea] = useState({ w: 0, h: 0 });

  const pages = useMemo(() => {
    const s = islandStats(topics);
    const out: Stat[][] = [];
    for (let i = 0; i < s.length; i += 6) out.push(s.slice(i, i + 6));
    return out;
  }, [topics]);
  const trending = useMemo(() => [...topics].sort((a, b) => b.now - a.now).slice(0, 2), [topics]);

  const onArea = (e: LayoutChangeEvent) => setArea({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height });
  const cellW = (area.w - 32 - 10) / 2;
  const cellH = area.h / 3;
  const img = Math.max(60, Math.min(cellW * 0.92, cellH - 44));

  return (
    <View style={{ flex: 1 }}>
      <Background source={BACKGROUNDS.chat} veil={0.22} />
      <View style={{ flex: 1, paddingTop: insets.top + 10 }}>
        <View style={styles.topbar}>
          <RoundButton label={t.search.title} onPress={() => router.push('/busca')}><Search color={colors.ink} /></RoundButton>
          <View style={styles.logo}><EloMark size={32} /><Txt style={styles.logoWord}>elo</Txt></View>
          <RoundButton label={t.create.title} onPress={() => router.push('/criar')}><Plus color={colors.ink} /></RoundButton>
        </View>

        <Txt variant="label" center style={{ marginTop: 10, marginBottom: 7 }}>{t.home.trending}</Txt>
        <View style={styles.trendRow}>
          {trending.map((tp) => (
            <Pressable key={tp.id} style={styles.chip} onPress={() => router.push(`/topico/${tp.id}`)}>
              <Image source={ISLAND_IMAGES[tp.category]} style={{ width: 28, height: 28 }} />
              <Txt style={styles.chipText}>{tp.title}</Txt>
              {tp.now >= 2 ? <Txt style={styles.chipNow}>{tp.now}</Txt> : null}
            </Pressable>
          ))}
        </View>

        <Txt variant="h2" center style={{ marginTop: 8, fontSize: 26 }}>{t.home.explore}</Txt>

        <View style={{ flex: 1 }} onLayout={onArea}>
          {area.w > 0 && (
            <FlatList
              data={pages}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              keyExtractor={(_, i) => String(i)}
              onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / area.w))}
              renderItem={({ item, index: pi }) => (
                <View style={[styles.page, { width: area.w, height: area.h }]}>
                  {item.map((c, i) => (
                    <Pressable key={c.key} accessibilityRole="button" accessibilityLabel={t.categories[c.key]}
                      onPress={() => router.push(`/ilha/${c.key}`)}
                      style={[styles.cell, { width: cellW, height: cellH }]}>
                      <Floating seed={pi * 6 + i}>
                        <Image source={ISLAND_IMAGES[c.key as CategoryKey]} style={{ width: img, height: img }} contentFit="contain" />
                      </Floating>
                      <View style={styles.nameTag}><Txt style={styles.name}>{t.categories[c.key]}</Txt></View>
                      <Txt style={[styles.meta, c.now >= 2 && { color: colors.ok }]}>
                        {c.now >= 2 ? t.home.talking(c.now) : t.home.topics(c.count)}
                      </Txt>
                    </Pressable>
                  ))}
                </View>
              )}
            />
          )}
        </View>

        <View style={styles.dots}>
          {pages.map((_, i) => <View key={i} style={[styles.dot, i === page && styles.dotOn]} />)}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16 },
  logo: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  logoWord: { fontFamily: fonts.displayMedium, fontSize: 32, lineHeight: 36, color: colors.ink },
  trendRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16 },
  chip: {
    flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 5, paddingLeft: 5, paddingRight: 12,
    backgroundColor: 'rgba(255,253,249,0.95)', borderRadius: radius.md, borderWidth: 1, borderColor: colors.line,
  },
  chipText: { flex: 1, fontFamily: fonts.bodyBold, fontSize: 12.5, lineHeight: 16 },
  chipNow: { fontFamily: fonts.bodySemi, fontSize: 11, color: colors.ok },
  page: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, columnGap: 10 },
  cell: { alignItems: 'center', justifyContent: 'center' },
  nameTag: { backgroundColor: 'rgba(251,243,232,0.82)', borderRadius: radius.sm, paddingHorizontal: 9, marginTop: -2 },
  name: { fontFamily: fonts.display, fontSize: 19, lineHeight: 22 },
  meta: { fontFamily: fonts.bodyBold, fontSize: 11.5, color: colors.muted, marginTop: 2 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 7, paddingVertical: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(47,46,58,0.22)' },
  dotOn: { width: 22, backgroundColor: colors.teal },
});
