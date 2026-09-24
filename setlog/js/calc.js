// Training math and derived statistics (history per exercise, PRs, records).

export const WEIGHT_CATS = new Set(['barbell', 'dumbbell', 'machine', 'weighted_bw', 'assisted_bw']);
export const usesWeight = (cat) => WEIGHT_CATS.has(cat);
export const usesReps = (cat) => usesWeight(cat) || cat === 'reps';
export const usesDistance = (cat) => cat === 'cardio';
export const usesTime = (cat) => cat === 'cardio' || cat === 'duration';
/** Categories where "heavier is better" records make sense */
export const hasLoadRecords = (cat) => usesWeight(cat) && cat !== 'assisted_bw';

export function est1RM(w, r, formula = 'epley') {
  if (!(w > 0) || !(r > 0)) return 0;
  if (r === 1) return w;
  if (formula === 'brzycki') return r < 37 ? w * 36 / (37 - r) : 0;
  return w * (1 + r / 30);
}

export const isWorking = (s) => s.type !== 'warmup';

/** Is a canonical set (numbers) complete enough to be saved? */
export function setIsValid(s, cat) {
  if (usesWeight(cat)) return s.r > 0 && s.w !== null && s.w !== undefined && s.w >= 0;
  if (cat === 'reps') return s.r > 0;
  if (cat === 'cardio') return (s.d > 0) || (s.t > 0);
  if (cat === 'duration') return s.t > 0;
  return false;
}

export function setVolume(s, cat) {
  if (!hasLoadRecords(cat)) return 0;
  return (s.w || 0) * (s.r || 0);
}

export function workoutVolume(w, exById) {
  let v = 0;
  for (const e of w.exercises) {
    const ex = exById.get(e.exerciseId);
    if (!ex) continue;
    for (const s of e.sets) if (isWorking(s)) v += setVolume(s, ex.category);
  }
  return v;
}

export function workoutSetCount(w) {
  let n = 0;
  for (const e of w.exercises) n += e.sets.length;
  return n;
}

/** Best set of an exercise entry for summaries (highest e1RM, or most reps / distance / time). */
export function bestSet(sets, cat, formula) {
  let best = null, bestScore = -1;
  for (const s of sets) {
    if (!isWorking(s) && sets.some(isWorking)) continue;
    let score;
    if (hasLoadRecords(cat)) score = est1RM(s.w, s.r, formula) || (s.w || 0) * 0.001 + (s.r || 0) * 1e-6;
    else if (cat === 'assisted_bw') score = (s.r || 0) - (s.w || 0) * 0.001;
    else if (cat === 'reps') score = s.r || 0;
    else if (cat === 'cardio') score = (s.d || 0) * 1e6 + (s.t || 0);
    else score = s.t || 0;
    if (score > bestScore) { bestScore = score; best = s; }
  }
  return best;
}

// ---------- PR metrics ----------
export const PR_LABEL = {
  e1rm: 'Est. 1RM', weight: 'Weight', volume: 'Set volume', reps: 'Reps', distance: 'Distance', time: 'Time',
};

function metricsFor(s, cat, formula) {
  const out = {};
  if (hasLoadRecords(cat)) {
    if (s.w > 0 && s.r > 0) {
      out.e1rm = est1RM(s.w, s.r, formula);
      out.weight = s.w;
      out.volume = s.w * s.r;
    }
  } else if (cat === 'reps' || cat === 'assisted_bw') {
    if (cat === 'reps' && s.r > 0) out.reps = s.r;
  } else if (cat === 'cardio') {
    if (s.d > 0) out.distance = s.d;
    if (s.t > 0) out.time = s.t;
  } else if (cat === 'duration') {
    if (s.t > 0) out.time = s.t;
  }
  return out;
}

/**
 * Build derived statistics from all workouts in one pass.
 * - byExercise: exerciseId -> sessions (newest first): { workoutId, startedAt, name, entry }
 * - prSets: setId -> array of metric keys that were a PR when performed
 * - prsByWorkout: workoutId -> [{ exerciseId, metric, value, setId }]
 */
export function buildStats(workouts, exById, formula = 'epley') {
  const asc = [...workouts].sort((a, b) => a.startedAt - b.startedAt);
  const byExercise = new Map();
  const bests = new Map(); // exerciseId -> {metric: value}
  const prSets = new Map();
  const prsByWorkout = new Map();

  for (const w of asc) {
    const wPrs = [];
    // Several entries of the same exercise in one workout are evaluated together
    const perEx = new Map();
    w.exercises.forEach((entry) => {
      if (!perEx.has(entry.exerciseId)) perEx.set(entry.exerciseId, []);
      perEx.get(entry.exerciseId).push(entry);
      let arr = byExercise.get(entry.exerciseId);
      if (!arr) { arr = []; byExercise.set(entry.exerciseId, arr); }
      arr.push({ workoutId: w.id, startedAt: w.startedAt, name: w.name, entry });
    });
    for (const [exId, entries] of perEx) {
      const ex = exById.get(exId);
      if (!ex) continue;
      const prev = bests.get(exId);
      const sessionBest = {};
      for (const entry of entries) {
        for (const s of entry.sets) {
          if (!isWorking(s)) continue;
          const m = metricsFor(s, ex.category, formula);
          for (const [k, v] of Object.entries(m)) {
            if (!sessionBest[k] || v > sessionBest[k].value) sessionBest[k] = { value: v, setId: s.id };
          }
        }
      }
      if (prev) {
        for (const [k, { value, setId }] of Object.entries(sessionBest)) {
          if (prev[k] !== undefined && value > prev[k] + 1e-9) {
            const list = prSets.get(setId) || [];
            list.push(k);
            prSets.set(setId, list);
            wPrs.push({ exerciseId: exId, metric: k, value, setId });
          }
        }
      }
      const nb = { ...(prev || {}) };
      for (const [k, { value }] of Object.entries(sessionBest)) nb[k] = Math.max(nb[k] ?? -Infinity, value);
      bests.set(exId, nb);
    }
    if (wPrs.length) prsByWorkout.set(w.id, wPrs);
  }
  for (const arr of byExercise.values()) arr.reverse();
  return { byExercise, prSets, prsByWorkout, bests };
}

/** PRs a not-yet-saved workout would set, relative to the stored bests. */
export function prsForNewWorkout(workout, stats, exById, formula) {
  const res = [];
  const seen = new Map();
  for (const entry of workout.exercises) {
    const ex = exById.get(entry.exerciseId);
    if (!ex) continue;
    const prev = stats.bests.get(entry.exerciseId);
    if (!prev) continue;
    for (const s of entry.sets) {
      if (!isWorking(s)) continue;
      for (const [k, v] of Object.entries(metricsFor(s, ex.category, formula))) {
        if (prev[k] === undefined || !(v > prev[k] + 1e-9)) continue;
        const key = entry.exerciseId + ':' + k;
        const cur = seen.get(key);
        if (!cur || v > cur.value) seen.set(key, { exerciseId: entry.exerciseId, metric: k, value: v, setId: s.id });
      }
    }
  }
  for (const v of seen.values()) res.push(v);
  return res;
}

/** Records for one exercise from its sessions (newest first). */
export function exerciseRecords(sessions, cat, formula) {
  const rec = {
    e1rm: null, weight: null, volume: null, sessionVolume: null, reps: null, distance: null, time: null,
    totalSets: 0, totalReps: 0, totalVolume: 0, totalDistance: 0, totalTime: 0, sessions: sessions.length,
    repMax: new Map(), // reps -> {w, at, workoutId}
  };
  const better = (slot, value, at, workoutId, extra) => {
    if (!(value > 0)) return;
    if (!rec[slot] || value > rec[slot].value) rec[slot] = { value, at, workoutId, ...extra };
  };
  for (const { entry, startedAt, workoutId } of sessions) {
    let sv = 0;
    for (const s of entry.sets) {
      if (!isWorking(s)) continue;
      rec.totalSets++;
      rec.totalReps += s.r || 0;
      rec.totalDistance += s.d || 0;
      rec.totalTime += s.t || 0;
      if (hasLoadRecords(cat) && s.w > 0 && s.r > 0) {
        const vol = s.w * s.r;
        sv += vol;
        better('e1rm', est1RM(s.w, s.r, formula), startedAt, workoutId, { w: s.w, r: s.r });
        better('weight', s.w, startedAt, workoutId, { r: s.r });
        better('volume', vol, startedAt, workoutId, { w: s.w, r: s.r });
        const cur = rec.repMax.get(s.r);
        if (!cur || s.w > cur.w) rec.repMax.set(s.r, { w: s.w, at: startedAt, workoutId });
      }
      if (cat === 'reps' || cat === 'assisted_bw' || cat === 'weighted_bw') better('reps', s.r, startedAt, workoutId, { w: s.w });
      if (cat === 'cardio') better('distance', s.d, startedAt, workoutId, { t: s.t });
      if (cat === 'cardio' || cat === 'duration') better('time', s.t, startedAt, workoutId, { d: s.d });
    }
    rec.totalVolume += sv;
    better('sessionVolume', sv, startedAt, workoutId);
  }
  return rec;
}

/** Per-session series for charts, oldest first. */
export function exerciseSeries(sessions, cat, metric, formula) {
  const pts = [];
  for (let i = sessions.length - 1; i >= 0; i--) {
    const { entry, startedAt, workoutId } = sessions[i];
    const ws = entry.sets.filter(isWorking);
    if (!ws.length) continue;
    let y = 0;
    switch (metric) {
      case 'e1rm': y = Math.max(0, ...ws.map((s) => est1RM(s.w, s.r, formula))); break;
      case 'weight': y = Math.max(0, ...ws.map((s) => (s.r > 0 ? s.w || 0 : 0))); break;
      case 'volume': y = ws.reduce((a, s) => a + (s.w || 0) * (s.r || 0), 0); break;
      case 'setVolume': y = Math.max(0, ...ws.map((s) => (s.w || 0) * (s.r || 0))); break;
      case 'reps': y = Math.max(0, ...ws.map((s) => s.r || 0)); break;
      case 'totalReps': y = ws.reduce((a, s) => a + (s.r || 0), 0); break;
      case 'distance': y = ws.reduce((a, s) => a + (s.d || 0), 0); break;
      case 'time': y = ws.reduce((a, s) => a + (s.t || 0), 0); break;
      case 'pace': {
        const d = ws.reduce((a, s) => a + (s.d || 0), 0), t = ws.reduce((a, s) => a + (s.t || 0), 0);
        y = d > 0 && t > 0 ? t / d : 0; break;
      }
      default: y = 0;
    }
    if (y > 0) pts.push({ x: startedAt, y, workoutId });
  }
  return pts;
}

export function chartMetricsFor(cat) {
  if (hasLoadRecords(cat)) {
    return [
      { id: 'e1rm', label: 'Est. 1RM', kind: 'weight' },
      { id: 'weight', label: 'Heaviest weight', kind: 'weight' },
      { id: 'volume', label: 'Session volume', kind: 'weight' },
      { id: 'setVolume', label: 'Best set volume', kind: 'weight' },
      { id: 'totalReps', label: 'Total reps', kind: 'count' },
    ];
  }
  if (cat === 'assisted_bw' || cat === 'reps') {
    return [
      { id: 'reps', label: 'Most reps (set)', kind: 'count' },
      { id: 'totalReps', label: 'Total reps', kind: 'count' },
    ];
  }
  if (cat === 'cardio') {
    return [
      { id: 'distance', label: 'Distance', kind: 'distance' },
      { id: 'time', label: 'Time', kind: 'time' },
      { id: 'pace', label: 'Pace', kind: 'pace' },
    ];
  }
  return [{ id: 'time', label: 'Total time', kind: 'time' }];
}

// ---------- plates & warm-ups ----------
/** Plates per side for a target total. Returns { plates: [..], remainder } */
export function platesFor(total, bar, available) {
  let side = (total - bar) / 2;
  const plates = [];
  if (side <= 0) return { plates, remainder: 0 };
  const sorted = [...available].filter((p) => p > 0).sort((a, b) => b - a);
  for (const p of sorted) {
    while (side >= p - 1e-9) { plates.push(p); side -= p; }
  }
  return { plates, remainder: Math.round(side * 2 * 1000) / 1000 };
}

/** Round to the nearest loadable step (2 × smallest plate), never below the bar. */
export function roundToLoadable(w, bar, available) {
  const smallest = Math.min(...available.filter((p) => p > 0));
  const step = Number.isFinite(smallest) ? smallest * 2 : 2.5;
  return Math.max(bar, Math.round((w - bar) / step) * step + bar);
}

/** Classic warm-up ramp towards a working weight. */
export function warmupSets(working, bar, available, isBarbell) {
  const steps = [[0.4, 5], [0.6, 3], [0.8, 2]];
  const out = [];
  if (isBarbell && working > bar * 1.5) out.push({ w: bar, r: 10 });
  for (const [pct, r] of steps) {
    const w = isBarbell ? roundToLoadable(working * pct, bar, available) : Math.round(working * pct / 2) * 2;
    if (w <= 0 || w >= working) continue;
    if (out.length && Math.abs(out[out.length - 1].w - w) < 1e-9) continue;
    out.push({ w, r });
  }
  return out;
}
