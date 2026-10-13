// Backup files: everything in the app as one JSON file, and reading it back.

/** A backup file's text. `data` = { exercises, workouts, templates, measurements, kv }. */
export function makeBackup(data, appVersion, now = new Date()) {
  return JSON.stringify({
    app: 'setlog', schema: 1, appVersion, exportedAt: now.toISOString(), data,
  });
}

/** An error with an English message (a translation key) and its {placeholders}. */
function fail(message, vars) {
  const e = new Error(message);
  if (vars) e.vars = vars;
  return e;
}

/** Read a backup file. The built-in `seedExercises` are added back if the backup predates them. */
export function parseBackup(text, seedExercises = []) {
  let obj;
  try { obj = JSON.parse(text); } catch (e) { throw fail('This file isn’t valid JSON.'); }
  if (!obj || obj.app !== 'setlog' || !obj.data) throw fail('This isn’t a Setlog backup file.');
  const d = obj.data;
  for (const k of ['exercises', 'workouts', 'templates', 'measurements']) {
    if (d[k] !== undefined && !Array.isArray(d[k])) throw fail('The backup is damaged ({part}).', { part: k });
  }
  // the backup itself counts as a backup: without this the reminder would come
  // back early after a restore (the file holds the time of the backup before it)
  const kv = { ...(d.kv || {}) };
  const madeAt = Date.parse(obj.exportedAt || '');
  if (Number.isFinite(madeAt)) kv.meta = { ...(kv.meta || {}), lastBackupAt: Math.max(kv.meta?.lastBackupAt || 0, madeAt) };
  // keep the built-in library even if the backup predates it
  const exercises = d.exercises || [];
  const ids = new Set(exercises.map((e) => e.id));
  for (const e of seedExercises) if (!ids.has(e.id)) exercises.push({ ...e });
  return {
    exportedAt: obj.exportedAt,
    data: {
      exercises,
      workouts: d.workouts || [],
      templates: d.templates || [],
      measurements: d.measurements || [],
      kv,
    },
  };
}

