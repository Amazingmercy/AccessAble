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
  db.run(`
    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, account_number TEXT UNIQUE NOT NULL,
      phone TEXT, email TEXT, balance INTEGER NOT NULL DEFAULT 0,
      activation_token TEXT UNIQUE NOT NULL, status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS beneficiaries (
      id TEXT PRIMARY KEY, customer_id TEXT NOT NULL, name TEXT NOT NULL,
      account_number TEXT NOT NULL, bank_name TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS credentials (
      id TEXT PRIMARY KEY, customer_id TEXT NOT NULL, credential_id TEXT UNIQUE NOT NULL,
      public_key TEXT NOT NULL, counter INTEGER NOT NULL DEFAULT 0, transports TEXT
    );
    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY, customer_id TEXT NOT NULL, type TEXT NOT NULL,
      description TEXT NOT NULL, amount INTEGER NOT NULL, status TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
  const count = Number(db.exec("SELECT COUNT(*) AS n FROM customers")[0].values[0][0]);
  if (!count) {
    const now = new Date().toISOString();
    const insert = db.prepare(`INSERT INTO customers
      (id,name,account_number,phone,email,balance,activation_token,status,created_at)
      VALUES (?,?,?,?,?,?,?,?,?)`);
    insert.run(["c_emeka","Emeka Nwosu","AB-1002","08030000002","emeka@example.test",8500000,"emeka-demo-token","active",now]);
    insert.run(["c_john","John Okafor","AB-1001","08030000001","john@example.test",12500000,"john-demo-token","active",now]);
    insert.free();
    const b = db.prepare("INSERT INTO beneficiaries (id,customer_id,name,account_number,bank_name) VALUES (?,?,?,?,?)");
    b.run(["b1","c_emeka","Mama","0123456789","Demo Bank"]);
    b.run(["b2","c_emeka","Chika","0987654321","Demo Bank"]);
    b.run(["b3","c_john","Grace","0112233445","Demo Bank"]);
    b.free();
    const t = db.prepare("INSERT INTO transactions (id,customer_id,type,description,amount,status,created_at) VALUES (?,?,?,?,?,?,?)");
    t.run(["t1","c_emeka","credit","Salary payment",450000,"successful",new Date(Date.now()-86400000).toISOString()]);
    t.run(["t2","c_emeka","debit","Groceries",32500,"successful",new Date(Date.now()-172800000).toISOString()]);
    t.run(["t3","c_john","credit","Transfer received",120000,"successful",new Date(Date.now()-259200000).toISOString()]);
    t.free();
  }
  persist();
}

export function persist() {
  if (db) fs.writeFileSync(dbPath, Buffer.from(db.export()));
}
export function query(sql, params=[]) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows=[];
  while(stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}
export function run(sql, params=[]) {
  db.run(sql, params);
  persist();
}
export function one(sql, params=[]) { return query(sql,params)[0] || null; }
