// Creating or editing an exercise opens its own screen (exercise-form.tsx)
// and resolves once it closes: the saved exercise, or null if cancelled.
import { router } from 'expo-router';

import type { Exercise } from '@/data/types';

type Form = { id: string | null; name: string; resolve: (ex: Exercise | null) => void };
let pending: Form | null = null;

/** Create an exercise (optionally with a name typed in a search) or edit one (`id`). */
export function editExercise(o: { id?: string; name?: string } = {}): Promise<Exercise | null> {
  pending?.resolve(null);
  return new Promise((resolve) => {
    pending = { id: o.id || null, name: o.name || '', resolve };
    router.push('/exercise-form');
  });
}

export const currentForm = () => pending;

export function finishForm(ex: Exercise | null) {
  const p = pending;
  pending = null;
  p?.resolve(ex);
}
