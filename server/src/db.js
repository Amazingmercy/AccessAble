import initSqlJs from "sql.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(here, "../data");
const dbPath = path.join(dataDir, "accessable.sqlite");
let db;

export async function initDb() {
  fs.mkdirSync(dataDir, { recursive: true });
  const SQL = await initSqlJs({ locateFile: file => path.resolve(here, "../node_modules/sql.js/dist", file) });
  if (fs.existsSync(dbPath)) {
    db = new SQL.Database(fs.readFileSync(dbPath));
  } else {
    db = new SQL.Database();
  }

  // Base schema
  db.run(`
    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      account_number TEXT UNIQUE NOT NULL,
      phone TEXT,
      email TEXT,
      balance INTEGER NOT NULL DEFAULT 0,
      activation_token TEXT UNIQUE NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS beneficiaries (
      id TEXT PRIMARY KEY,
      customer_id TEXT NOT NULL,
      name TEXT NOT NULL,
      nickname TEXT,
      account_holder_name TEXT,
      account_number TEXT NOT NULL,
      bank_name TEXT NOT NULL,
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS credentials (
      id TEXT PRIMARY KEY,
      customer_id TEXT NOT NULL,
      credential_id TEXT UNIQUE NOT NULL,
      public_key TEXT NOT NULL,
      counter INTEGER NOT NULL DEFAULT 0,
      transports TEXT,
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      reference TEXT,
      customer_id TEXT NOT NULL,
      type TEXT NOT NULL,
      description TEXT NOT NULL,
      amount INTEGER NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS accessibility_preferences (
      customer_id TEXT PRIMARY KEY,
      voice_guidance INTEGER NOT NULL DEFAULT 1,
      speech_rate REAL NOT NULL DEFAULT 1.0,
      text_size TEXT NOT NULL DEFAULT 'normal',
      high_contrast INTEGER NOT NULL DEFAULT 0,
      screen_reader INTEGER NOT NULL DEFAULT 1,
      preferred_interaction_mode TEXT NOT NULL DEFAULT 'voice_first',
      updated_at TEXT NOT NULL
    );
  `);

  // Migrate beneficiaries columns if missing
  const bCols = query("PRAGMA table_info(beneficiaries)").map(c => c.name);
  if (!bCols.includes("nickname")) {
    db.run("ALTER TABLE beneficiaries ADD COLUMN nickname TEXT");
    db.run("UPDATE beneficiaries SET nickname = name WHERE nickname IS NULL");
  }
  if (!bCols.includes("account_holder_name")) {
    db.run("ALTER TABLE beneficiaries ADD COLUMN account_holder_name TEXT");
    db.run("UPDATE beneficiaries SET account_holder_name = name WHERE account_holder_name IS NULL");
  }
  if (!bCols.includes("created_at")) {
    db.run("ALTER TABLE beneficiaries ADD COLUMN created_at TEXT");
    db.run("UPDATE beneficiaries SET created_at = datetime('now') WHERE created_at IS NULL");
  }

  // Migrate transactions columns if missing
  const tCols = query("PRAGMA table_info(transactions)").map(c => c.name);
  if (!tCols.includes("reference")) {
    db.run("ALTER TABLE transactions ADD COLUMN reference TEXT");
    const txs = query("SELECT id FROM transactions WHERE reference IS NULL");
    for (const t of txs) {
      const ref = "TXN-" + Math.random().toString(36).substring(2, 8).toUpperCase();
      db.run("UPDATE transactions SET reference = ? WHERE id = ?", [ref, t.id]);
    }
  }

  // Migrate credentials columns if missing
  const cCols = query("PRAGMA table_info(credentials)").map(c => c.name);
  if (!cCols.includes("created_at")) {
    db.run("ALTER TABLE credentials ADD COLUMN created_at TEXT");
    db.run("UPDATE credentials SET created_at = datetime('now') WHERE created_at IS NULL");
  }

  // Seed demo data if customers table is empty
  const count = Number(db.exec("SELECT COUNT(*) AS n FROM customers")[0].values[0][0]);
  if (!count) {
    const now = new Date().toISOString();
    const insert = db.prepare(`INSERT INTO customers
      (id,name,account_number,phone,email,balance,activation_token,status,created_at)
      VALUES (?,?,?,?,?,?,?,?,?)`);
    insert.run(["c_emeka","Emeka Nwosu","AB-1002","08030000002","emeka@example.test",8500000,"emeka-demo-token","active",now]);
    insert.run(["c_john","John Okafor","AB-1001","08030000001","john@example.test",12500000,"john-demo-token","active",now]);
    insert.free();

    const b = db.prepare(`INSERT INTO beneficiaries
      (id,customer_id,name,nickname,account_holder_name,account_number,bank_name,created_at)
      VALUES (?,?,?,?,?,?,?,?)`);
    b.run(["b1","c_emeka","Mama","Mama","Mary Nwosu","0123456789","Access Bank",now]);
    b.run(["b2","c_emeka","Chika","Chika","Chika Obi","0987654321","First Bank",now]);
    b.run(["b3","c_john","Grace","Grace","Grace Okafor","0112233445","Zenith Bank",now]);
    b.free();

    const t = db.prepare(`INSERT INTO transactions
      (id,reference,customer_id,type,description,amount,status,created_at)
      VALUES (?,?,?,?,?,?,?,?)`);
    t.run(["t1","TXN-EMEK-001","c_emeka","credit","Salary payment",4500000,"successful",new Date(Date.now()-86400000).toISOString()]);
    t.run(["t2","TXN-EMEK-002","c_emeka","debit","Groceries transfer to Mama",325000,"successful",new Date(Date.now()-172800000).toISOString()]);
    t.run(["t3","TXN-JOHN-001","c_john","credit","Transfer received",1200000,"successful",new Date(Date.now()-259200000).toISOString()]);
    t.free();
  }

  // Ensure every customer has accessibility preferences
  const customers = query("SELECT id FROM customers");
  for (const c of customers) {
    const pref = one("SELECT customer_id FROM accessibility_preferences WHERE customer_id = ?", [c.id]);
    if (!pref) {
      db.run(`INSERT INTO accessibility_preferences
        (customer_id, voice_guidance, speech_rate, text_size, high_contrast, screen_reader, preferred_interaction_mode, updated_at)
        VALUES (?, 1, 1.0, 'normal', 0, 1, 'voice_first', ?)`,
        [c.id, new Date().toISOString()]
      );
    }
  }

  // Ensure existing beneficiaries have account_holder_name and bank_name properly set
  db.run("UPDATE beneficiaries SET nickname = name WHERE nickname IS NULL OR nickname = ''");
  db.run("UPDATE beneficiaries SET account_holder_name = name WHERE account_holder_name IS NULL OR account_holder_name = ''");

  persist();
}

let inTransaction = false;

export function persist() {
  if (db && !inTransaction) fs.writeFileSync(dbPath, Buffer.from(db.export()));
}

export function query(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

export function run(sql, params = []) {
  db.run(sql, params);
  if (!inTransaction) persist();
}

export function one(sql, params = []) {
  return query(sql, params)[0] || null;
}

export function transaction(fn) {
  inTransaction = true;
  db.run("BEGIN TRANSACTION");
  try {
    const result = fn();
    db.run("COMMIT");
    inTransaction = false;
    persist();
    return result;
  } catch (err) {
    try { db.run("ROLLBACK"); } catch {}
    inTransaction = false;
    throw err;
  }
}
