// Today: what to do now. The date, the routine that is up next (or the
// workout that's running) with its one Start button, at most one coach note,
// this week's sessions and the sets per muscle of the last 7 days. The avatar
// opens Account. docs/design/navigation.md, phases.md → 2.
import { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { routineSize, setsPerMuscle, weekStrip } from '@setlog/core';

import { suggestion, useAppState } from '@/data/store';
import type { Template } from '@/data/types';
import { RADIUS, SPACE, TYPE } from '@/design/tally';
import { useFormat } from '@/lib/format';
import { useLang } from '@/lib/i18n';
import { useTally } from '@/lib/theme';
import { beginWorkout, openWorkout } from '@/lib/workout';
import { SymbolIcon } from '@/ui/tally/ListRow';
import { MuscleVolume } from '@/ui/tally/MuscleVolume';
import { RoutineCard } from '@/ui/tally/RoutineCard';
import { SectionHeader } from '@/ui/tally/SectionHeader';
import { TabRoot } from '@/ui/tally/TabRoot';
import type { StrokeState } from '@/ui/tally/Tally';
import { WeekStrip } from '@/ui/tally/WeekStrip';
import { useSessionView } from '@/ui/workout/MiniBar';

type Why = { kind: 'after' | 'weekday' | 'due'; name?: string; day?: number; at?: number };

export default function TodayTab() {
  const s = useAppState();
  const f = useFormat();
  const { tr } = f;
  const { locale } = useLang();
  const { colors: t } = useTally();
  const session = useSessionView();
  const sug = useMemo(() => (s.active ? null : suggestion(s)), [s.templates, s.workouts, !s.active]); // eslint-disable-line react-hooks/exhaustive-deps
  const goal = s.settings.weeklyGoal || 3;
  const week = useMemo(() => weekStrip(s.workouts, { weekStart: s.settings.weekStart, goal }) as {
    days: { start: number; done: number; planned: boolean }[]; today: number; done: number; goal: number;
  }, [s.workouts, s.settings.weekStart, goal]);
  const muscles = useMemo(() => setsPerMuscle(s.workouts, s.exercises) as { muscle: string; label: string; sets: number }[], [s.workouts, s.exercises]);
  const date = new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long' }).format(Date.now());

  const why = (w: Why) => {
    if (w.kind === 'weekday') {
      const d = new Date(); d.setDate(d.getDate() + (((w.day ?? 0) - d.getDay() + 7) % 7));
      const day = f.date.weekdayLong(d.getTime());
      return tr('Usually on {days}', { days: f.lang === 'de' ? `${day.toLowerCase()}s` : `${day}s` });
    }
    if (w.kind === 'after') return tr('Usually after {name}', { name: w.name ?? '' });
    return tr('Last done {when}', { when: f.relDayLower(w.at ?? 0) });
  };

  const name = s.profile.name.trim();
  const avatar = (
    <Pressable onPress={() => router.push('/account')} accessibilityRole="button" testID="open-account"
      accessibilityLabel={name ? tr('Account, {name}', { name }) : tr('Account')} hitSlop={4}
      style={({ pressed }) => ({ width: 36, height: 36, borderRadius: RADIUS.capsule, alignItems: 'center', justifyContent: 'center', backgroundColor: t.paper3, opacity: pressed ? 0.6 : 1 })}>
      {name
        ? <Text style={{ fontSize: 15, fontWeight: '600', color: t.ink }}>{name.charAt(0).toUpperCase()}</Text>
        : <SymbolIcon name="person.crop.circle" size={20} color={t.ink} />}
    </Pressable>
  );

  let card;
  if (s.active && session) {
    const a = s.active;
    card = (
      <RoutineCard testID="now-card" context={tr('In progress · since {time}', { time: f.date.time(a.startedAt) })} name={a.name}
        tally={{ groups: session.groups, label: tr('{done} of {total} sets logged', { done: session.done, total: session.total }) }}
        facts={tr('{done} of {total} sets', { done: session.done, total: session.total }) + (session.records ? ` · ${f.plural(session.records, 'record')}` : '')}
        start={{ title: tr('Resume workout'), onPress: openWorkout, testID: 'resume-workout' }} />
    );
  } else if (sug) {
    const tpl = sug.template as Template;
    const entries = tpl.exercises.filter((e) => s.exercises.has(e.exerciseId));
    const size = routineSize(tpl, s.exercises, { defaultRest: s.settings.defaultRest }) as { exercises: number; sets: number; minutes: number };
    const groups: StrokeState[][] = entries.map((e) => e.sets.map((x) => (x.type === 'warmup' ? 'warmupPending' : 'pending')));
    card = (
      <RoutineCard testID="up-next" context={`${tr('Up next')} · ${why(sug.why)}`} name={tpl.name}
        exercises={entries.map((e) => f.exName(s.exercises.get(e.exerciseId)))}
        tally={{ groups, label: f.plural(size.sets, 'set') }}
        facts={[f.plural(size.exercises, 'exercise'), f.plural(size.sets, 'set'), size.minutes ? tr('about {n} min', { n: size.minutes }) : ''].filter(Boolean).join(' · ')}
        onPress={() => router.push({ pathname: '/template/[id]', params: { id: tpl.id } })}
        start={{ title: tr('Start'), onPress: () => beginWorkout({ template: tpl }, f), testID: 'start-suggested' }} />
    );
  } else {
    card = (
      <RoutineCard testID="up-next" context={tr('Up next')} name={tr('Empty workout')}
        facts={tr('Add exercises as you go, or start a routine from Plan.')}
        start={{ title: tr('Start an empty workout'), onPress: () => beginWorkout({}, f), testID: 'start-empty' }} />
    );
  }

  const scope = tr('{done} of {goal} sessions', { done: week.done, goal });
  return (
    <TabRoot title={tr('Today')} eyebrow={date} right={avatar}>
      <View style={{ paddingHorizontal: SPACE.s5 }}>{card}</View>

      {/* The coach note slot: at most one note here once TrueTrain arrives (docs/design/coaching.md, phase 7). */}

      <SectionHeader title={tr('This week')} scope={scope} testID="week-head" />
      <WeekStrip testID="week-strip" today={week.today} label={`${tr('This week')}: ${scope}`}
        days={week.days.map((d) => ({ ...d, letter: f.date.weekdayNarrow(d.start) }))} />

      <SectionHeader title={tr('Sets per muscle')} scope={tr('Last 7 days')} />
      {muscles.length ? (
        <MuscleVolume rows={muscles.map((m) => ({ ...m, label: tr(m.label) }))}
          accessibilityLabel={(r) => `${r.label}, ${f.plural(r.sets, 'set')}`} />
      ) : (
        <Text style={[TYPE.subhead, { color: t.ink2, paddingHorizontal: SPACE.s5 }]}>{tr('No sets in the last 7 days.')}</Text>
      )}
    </TabRoot>
  );
}
