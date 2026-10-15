// Picking exercises opens its own screen (pick-exercises.tsx) and resolves
// once that screen closes: the ids picked, or null if it was cancelled.
import { router } from 'expo-router';

type Pick = { multi: boolean; title?: string; resolve: (ids: string[] | null) => void };
let pending: Pick | null = null;

export function pickExercises(o: { multi?: boolean; title?: string } = {}): Promise<string[] | null> {
  pending?.resolve(null);
  return new Promise((resolve) => {
    pending = { multi: !!o.multi, title: o.title, resolve };
    router.push('/pick-exercises');
  });
}

export const currentPick = () => pending;

export function finishPick(ids: string[] | null) {
  const p = pending;
  pending = null;
  p?.resolve(ids && ids.length ? ids : null);
}
