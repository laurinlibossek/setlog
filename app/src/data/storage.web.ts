// In a browser (development and tests only): the same interface as
// storage.ts, kept in localStorage. The phone apps use SQLite.
import { STORES, type Data, type Kv, type StoreName } from './types';

type Doc = { id: string };
const KEY = 'increment.data';

function read(): Data {
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    if (raw) return JSON.parse(raw) as Data;
  } catch {
    // unavailable or damaged: start empty
  }
  return { exercises: [], workouts: [], templates: [], measurements: [], kv: {} };
}

function write(data: Data): void {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(data));
  } catch {
    // storage full or blocked: the data stays in memory for this session
  }
}

let cache: Data | null = null;
const data = (): Data => (cache ??= read());

export async function loadAll(): Promise<Data> {
  return JSON.parse(JSON.stringify(data())) as Data;
}

export async function put(store: StoreName, obj: Doc): Promise<void> {
  await putMany(store, [obj]);
}

export async function putMany(store: StoreName, list: Doc[]): Promise<void> {
  const d = data();
  const arr = d[store] as Doc[];
  for (const o of list) {
    const i = arr.findIndex((x) => x.id === o.id);
    const copy = JSON.parse(JSON.stringify(o));
    if (i >= 0) arr[i] = copy; else arr.push(copy);
  }
  write(d);
}

export async function remove(store: StoreName, id: string): Promise<void> {
  const d = data();
  (d[store] as Doc[]) = (d[store] as Doc[]).filter((x) => x.id !== id);
  write(d);
}

export async function kvSet(key: keyof Kv, value: unknown): Promise<void> {
  const d = data();
  if (value === null || value === undefined) delete d.kv[key];
  else (d.kv as Record<string, unknown>)[key] = JSON.parse(JSON.stringify(value));
  write(d);
}

export async function replaceAll(next: Data): Promise<void> {
  cache = JSON.parse(JSON.stringify({ ...next, kv: next.kv || {} }));
  for (const s of STORES) if (!Array.isArray(cache![s])) (cache![s] as unknown[]) = [];
  write(cache!);
}
