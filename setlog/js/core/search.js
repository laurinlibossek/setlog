// Exercise search, the same in every app. Every word of the query must match.
// Shortcuts gym-goers type ("db", "bb", "ohp", "rdl"…) stand for their full
// words, and only count as written when they are a whole word, so "bb" finds
// barbell exercises and not every dumbBell one. Accents are ignored: "rück"
// finds "Rückenstrecker" and so does "ruck".

const ALIASES = {
  db: 'dumbbell', bb: 'barbell', ohp: 'overhead press', rdl: 'romanian deadlift', bp: 'bench press',
  dl: 'deadlift', kb: 'kettlebell', ez: 'ez bar', smith: 'smith', tri: 'triceps', tris: 'triceps', bi: 'bicep',
  bis: 'bicep', lat: 'lat', pulldown: 'pulldown', pullup: 'pull up', pushup: 'push up', chinup: 'chin up',
  situp: 'sit up', hamstring: 'leg curl', quad: 'leg extension', delt: 'raise', abs: 'crunch',
};

const fold = (s) => String(s).toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
const norm = (s) => fold(s).replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/** Does an exercise ({ name }) match what was typed? */
export function matchExercise(ex, query) {
  const q = norm(query);
  if (!q) return true;
  const name = norm(ex.name);
  const words = name.split(' ');
  const compact = words.join('');
  return q.split(' ').every((tok) => {
    const alias = ALIASES[tok];
    if (alias) return words.includes(tok) || alias.split(' ').every((a) => name.includes(a));
    return name.includes(tok) || compact.includes(tok);
  });
}
