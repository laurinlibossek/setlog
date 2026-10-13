// The suggested workout: which template probably comes next, from what usually
// follows the last one and what is usually done on this weekday.
import { DAY } from './units.js';

/**
 * Guess which template comes next from the last four months: what usually
 * follows the most recent template, and what is usually done on this weekday.
 * Both count recent workouts more: each older occurrence weighs SUGGEST_DECAY
 * times the one after it, so a changed routine takes over after about two
 * rounds while a single swapped day doesn't flip the suggestion.
 * Returns { template, why: { kind: 'after'|'weekday'|'due', ... } } or null.
 */
const SUGGEST_DECAY = 0.6;
export function suggestTemplate(templates, workouts, now = Date.now()) {
  const live = new Map(templates.filter((t) => !t.archived).map((t) => [t.id, t]));
  const seq = workouts
    .filter((w) => w.templateId && live.has(w.templateId) && w.startedAt < now && w.startedAt >= now - 120 * DAY)
    .sort((a, b) => a.startedAt - b.startedAt);
  if (seq.length < 2) return null;
  const last = seq[seq.length - 1];
  const ids = [...new Set(seq.map((w) => w.templateId))];

  // what followed the last template before (newer transitions weigh more)
  const after = new Map();
  let afterTotal = 0, k = 0;
  for (let i = seq.length - 2; i >= 0; i--) {
    if (seq[i].templateId !== last.templateId) continue;
    const wgt = SUGGEST_DECAY ** k++;
    after.set(seq[i + 1].templateId, (after.get(seq[i + 1].templateId) || 0) + wgt);
    afterTotal += wgt;
  }
  // what is usually done on this weekday (last 8 weeks, newest weighs most)
  const today = new Date(now).getDay();
  const onDay = new Map(); // weighted
  const onDayCount = new Map();
  let dayTotal = 0, dayCount = 0, j = 0;
  for (let i = seq.length - 1; i >= 0; i--) {
    const w = seq[i];
    if (w.startedAt < now - 56 * DAY) break;
    if (new Date(w.startedAt).getDay() !== today) continue;
    const wgt = SUGGEST_DECAY ** j++;
    onDay.set(w.templateId, (onDay.get(w.templateId) || 0) + wgt);
    onDayCount.set(w.templateId, (onDayCount.get(w.templateId) || 0) + 1);
    dayTotal += wgt;
    dayCount++;
  }
  const lastDone = new Map(seq.map((w) => [w.templateId, w.startedAt]));
  let best = null;
  for (const id of ids) {
    const a = afterTotal ? (after.get(id) || 0) / afterTotal : 0;
    const d = dayCount >= 2 ? (onDay.get(id) || 0) / dayTotal : 0;
    // tie-breaker: the longer it hasn't been done, the more likely it's due
    const due = (now - lastDone.get(id)) / (120 * DAY) * 0.1;
    const score = 0.6 * a + 0.4 * d + due;
    if (!best || score > best.score) best = { id, score, a, d };
  }
  const template = live.get(best.id);
  let why;
  if (best.d >= 0.6 && (onDayCount.get(best.id) || 0) >= 2 && best.d >= best.a) why = { kind: 'weekday', day: today };
  else if (best.a > 0) why = { kind: 'after', name: live.get(last.templateId).name };
  else why = { kind: 'due', at: lastDone.get(best.id) };
  return { template, why };
}

