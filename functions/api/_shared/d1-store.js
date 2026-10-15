const TABLE = 'app_kv';

export async function readJSON(db, key) {
  const row = await db.prepare(`SELECT value FROM ${TABLE} WHERE key = ?`).bind(key).first();
  if (!row) return null;
  try { return JSON.parse(row.value); } catch { return null; }
}

export async function writeJSON(db, key, value) {
  await db.prepare(`INSERT INTO ${TABLE}(key, value, updated_at) VALUES(?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`)
    .bind(key, JSON.stringify(value)).run();
}

export async function readText(db, key) {
  const row = await db.prepare(`SELECT value FROM ${TABLE} WHERE key = ?`).bind(key).first();
  return row?.value ?? null;
}

export async function writeText(db, key, value) {
  await db.prepare(`INSERT INTO ${TABLE}(key, value, updated_at) VALUES(?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`)
    .bind(key, String(value)).run();
}

export async function removeKey(db, key) {
  await db.prepare(`DELETE FROM ${TABLE} WHERE key = ?`).bind(key).run();
}
