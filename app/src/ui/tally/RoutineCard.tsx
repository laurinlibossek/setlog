// A routine as something to start: where it sits, its name, its exercises, a
// tally of its sets, and the one Start button. The only card style in the app;
// never put a card inside it. docs/design/components.md
import { Pressable, Text, View } from 'react-native';

import { RADIUS, SPACE, TYPE } from '@/design/tally';
import { useTally } from '@/lib/theme';
import { Button } from '@/ui/kit';
import { Tally, type StrokeState } from './Tally';

type Props = {
  /** "Up next · Usually on Tuesdays" */
  context?: string;
  name: string;
  /** The exercise names, joined into two lines at most. */
  exercises?: string[];
  tally?: { groups: StrokeState[][]; label: string };
  /** "6 exercises · 20 sets · about 55 min" */
  facts?: string;
  start?: { title: string; onPress: () => void; testID?: string };
  /** Tapping the card outside the button (opens the routine). */
  onPress?: () => void;
  testID?: string;
};

export function RoutineCard({ context, name, exercises, tally, facts, start, onPress, testID }: Props) {
  const { colors: t } = useTally();
  const body = (
    <>
      <View style={{ gap: 2 }}>
        {!!context && <Text style={[TYPE.footnote, { color: t.ink2 }]} numberOfLines={1}>{context}</Text>}
        <Text style={[TYPE.title1, { color: t.ink }]} numberOfLines={2} accessibilityRole="header">{name}</Text>
      </View>
      {!!exercises?.length && <Text style={[TYPE.subhead, { color: t.ink2 }]} numberOfLines={2}>{exercises.join(', ')}</Text>}
      {(tally || facts) && (
        <View style={{ gap: 6 }}>
          {tally && tally.groups.length > 0 && <Tally groups={tally.groups} size="small" label={tally.label} />}
          {!!facts && <Text style={[TYPE.footnote, { color: t.ink2, fontVariant: ['tabular-nums'] }]} numberOfLines={2}>{facts}</Text>}
        </View>
      )}
    </>
  );
  const box = { gap: SPACE.s3, padding: SPACE.s5, borderRadius: RADIUS.l, backgroundColor: t.paper2 };
  return (
    <View style={box} testID={testID}>
      {onPress ? (
        <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => ({ gap: SPACE.s3, opacity: pressed ? 0.6 : 1 })}>{body}</Pressable>
      ) : body}
      {start && <Button large title={start.title} onPress={start.onPress} testID={start.testID} />}
    </View>
  );
}
