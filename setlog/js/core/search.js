// Exercise search, the same in every app. Every word of the query must match
// the English name or, for a built-in exercise, its German name.
// Shortcuts gym-goers type ("db", "bb", "ohp", "rdl"…) stand for their full
// words, and only count as written when they are a whole word, so "bb" finds
// barbell exercises and not every dumbBell one. Accents are ignored: "rück"
// finds "Rückenstrecker" and so does "ruck".

import { EXERCISE_NAMES_DE } from './exercise-names-de.js';

const ALIASES = {
  db: 'dumbbell', bb: 'barbell', ohp: 'overhead press', rdl: 'romanian deadlift', bp: 'bench press',
  dl: 'deadlift', kb: 'kettlebell', ez: 'ez bar', smith: 'smith', tri: 'triceps', tris: 'triceps', bi: 'bicep',
  bis: 'bicep', lat: 'lat', pulldown: 'pulldown', pullup: 'pull up', pushup: 'push up', chinup: 'chin up',
  situp: 'sit up', hamstring: 'leg curl', quad: 'leg extension', delt: 'raise', abs: 'crunch',
  kh: 'kurzhantel', lh: 'langhantel',
};

const fold = (s) => String(s).toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
const norm = (s) => fold(s).replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/** The name to show: a built-in exercise ({ id, name }) in German gets its German name unless it was renamed; anything else keeps its name. */
export function exerciseDisplayName(ex, lang) {
  if (!ex) return '';
  if (lang === 'de' && String(ex.id).startsWith('x-')) return EXERCISE_NAMES_DE[ex.name] || ex.name;
  return ex.name;
}

function matchName(name, toks) {
  const words = name.split(' ');
  const compact = words.join('');
  return toks.every((tok) => {
    const alias = ALIASES[tok];
    if (alias) return words.includes(tok) || alias.split(' ').every((a) => name.includes(a));
    return name.includes(tok) || compact.includes(tok);
  });
}

/** Does an exercise ({ id, name }) match what was typed? Built-ins match by their English or their German name. */
export function matchExercise(ex, query) {
  const q = norm(query);
  if (!q) return true;
  const toks = q.split(' ');
  if (matchName(norm(ex.name), toks)) return true;
  const de = exerciseDisplayName(ex, 'de');
  return de !== ex.name && matchName(norm(de), toks);
}
