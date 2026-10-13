// The built-in library from core/seed.js, with labels in the app language.
import { tr } from './i18n.js';
import * as core from './core/seed.js';

export const { SEED_VERSION, SEED_EXERCISES } = core;
const label = (list) => list.map((x) => ({ ...x, label: tr(x.label) }));
export const CATEGORIES = label(core.CATEGORIES);
export const CATEGORY_LABEL = Object.fromEntries(CATEGORIES.map((c) => [c.id, c.label]));
export const BODY_PARTS = label(core.BODY_PARTS);
export const BODY_PART_LABEL = Object.fromEntries(BODY_PARTS.map((b) => [b.id, b.label]));
export const MEASUREMENTS = label(core.MEASUREMENTS);
export const MEASUREMENT_BY_ID = Object.fromEntries(MEASUREMENTS.map((m) => [m.id, m]));
// "Push", "Pull" and "Legs" have no German entry: the split is known by those names
export const EXAMPLE_TEMPLATES = core.EXAMPLE_TEMPLATES.map((t) => ({ ...t, name: tr(t.name), folder: tr(t.folder) }));
