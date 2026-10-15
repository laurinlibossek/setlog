// Looking things up in the training history: the previous sets of an
// exercise, and the body weight on a given day.

/**
 * Sets from the most recent session in `sessions` (newest first, as built by
 * sessionsByExercise / buildStats) that started before `before` and isn't
 * `excludeWorkoutId`. With a `templateId`, a session from that template wins.
 * @param {any[] | null | undefined} sessions
 * @param {{ before?: number, excludeWorkoutId?: string | null, templateId?: string | null }} [o]
 * @returns {any[] | null}
 */
export function previousSetsFrom(sessions, { before = Infinity, excludeWorkoutId = null, templateId = null } = {}) {
  if (!sessions) return null;
  const ok = (s) => s.workoutId !== excludeWorkoutId && s.startedAt < before;
  if (templateId) {
    for (const s of sessions) if (ok(s) && s.templateId === templateId) return s.entry.sets;
  }
  for (const s of sessions) if (ok(s)) return s.entry.sets;
  return null;
}

/** Body weight (kg) on or before `at` from measurements (newest first); the earliest one if `at` is before all of them. */
export function bodyweightFrom(measurements, at = Date.now()) {
  let earliest = null;
  for (const m of measurements) {
    if (m.type !== 'bodyweight') continue;
    if (m.at <= at) return m.value;
    earliest = m.value;
  }
  return earliest;
}
