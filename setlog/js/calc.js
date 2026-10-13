// Training math from core/calc.js, with labels in the app language.
import { tr } from './i18n.js';
import * as core from './core/calc.js';

export * from './core/calc.js';
export const FORMULAS = core.FORMULAS.map((f) => ({ ...f, label: tr(f.label) }));
export const formulaLabel = (id) => tr(core.formulaLabel(id));
export const PR_LABEL = Object.fromEntries(Object.entries(core.PR_LABEL).map(([k, v]) => [k, tr(v)]));
export const chartMetricsFor = (cat) => core.chartMetricsFor(cat).map((m) => ({ ...m, label: tr(m.label) }));
