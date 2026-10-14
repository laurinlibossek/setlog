// On the phone: SQLite. Every record is stored as JSON in one table, keyed by
// store and id, the same layout the web app keeps in IndexedDB, so moving data
// between them is a backup file and nothing else.
import * as SQLite from 'expo-sqlite';

import { STORES, type Data, type Kv, type StoreName } from './types';

type Row = { id: string; data: string };
type KvRow = { key: string; value: string };
type Doc = { id: string };

let opening: Promise<SQLite.SQLiteDatabase> | null = null;

function db(): Promise<SQLite.SQLiteDatabase> {
  if (!opening) {
    opening = (async () => {
      const d = await SQLite.openDatabaseAsync('increment.db');
      await d.execAsync(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS docs (store TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY (store, id));
        CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
      `);
      return d;
    })();
    opening.catch(() => { opening = null; });
  }
  return opening;
}

export async function loadAll(): Promise<Data> {
  const d = await db();
  const data: Data = { exercises: [], workouts: [], templates: [], measurements: [], kv: {} };
  for (const store of STORES) {
    const rows = await d.getAllAsync<Row>('SELECT id, data FROM docs WHERE store = ?', store);
    (data[store] as unknown[]) = rows.map((r) => JSON.parse(r.data));
  }
  for (const r of await d.getAllAsync<KvRow>('SELECT key, value FROM kv')) {
    (data.kv as Record<string, unknown>)[r.key] = JSON.parse(r.value);
  }
  return data;
}

export async function put(store: StoreName, obj: Doc): Promise<void> {
  const d = await db();
  await d.runAsync('INSERT OR REPLACE INTO docs (store, id, data) VALUES (?, ?, ?)', store, obj.id, JSON.stringify(obj));
}

export async function putMany(store: StoreName, list: Doc[]): Promise<void> {
  if (!list.length) return;
  const d = await db();
  await d.withExclusiveTransactionAsync(async (tx) => {
    for (const o of list) {
      await tx.runAsync('INSERT OR REPLACE INTO docs (store, id, data) VALUES (?, ?, ?)', store, o.id, JSON.stringify(o));
    }
  });
}

export async function remove(store: StoreName, id: string): Promise<void> {
  const d = await db();
  await d.runAsync('DELETE FROM docs WHERE store = ? AND id = ?', store, id);
}

export async function kvSet(key: keyof Kv, value: unknown): Promise<void> {
  const d = await db();
  if (value === null || value === undefined) await d.runAsync('DELETE FROM kv WHERE key = ?', key);
  else await d.runAsync('INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)', key, JSON.stringify(value));
}

/** Replace everything at once (backup restore). Nothing changes if it fails halfway. */
export async function replaceAll(data: Data): Promise<void> {
  const d = await db();
  await d.withExclusiveTransactionAsync(async (tx) => {
    await tx.runAsync('DELETE FROM docs');
    await tx.runAsync('DELETE FROM kv');
    for (const store of STORES) {
      for (const o of data[store] as Doc[]) {
        await tx.runAsync('INSERT INTO docs (store, id, data) VALUES (?, ?, ?)', store, o.id, JSON.stringify(o));
      }
    }
    for (const [k, v] of Object.entries(data.kv)) {
      if (v !== null && v !== undefined) await tx.runAsync('INSERT INTO kv (key, value) VALUES (?, ?)', k, JSON.stringify(v));
    }
  });
}
