#!/usr/bin/env node
// Run a .sql file (or inline SQL) against SingleStore through its HTTPS Data API.
// Usage: node --env-file=.env.local scripts/s2-exec.mjs db/singlestore.sql
//        node --env-file=.env.local scripts/s2-exec.mjs --sql "SELECT COUNT(*) FROM catalog"
//        add --no-db to run without selecting a database (e.g. CREATE DATABASE)
// Never prints credentials.
import { readFileSync } from "node:fs";

const { SINGLESTORE_HOST: host, SINGLESTORE_USER: user, SINGLESTORE_PASSWORD: pass,
  SINGLESTORE_DATABASE: database } = process.env;
if (!host || !user || !pass) { console.error("missing SINGLESTORE_* env vars"); process.exit(2); }

const args = process.argv.slice(2);
const noDb = args.includes("--no-db");
const sqlIdx = args.indexOf("--sql");
const text = sqlIdx >= 0 ? args[sqlIdx + 1] : readFileSync(args.filter((a) => !a.startsWith("--"))[0], "utf8");

// Split on semicolons at end of line; good enough for our DDL/seed files.
const statements = text.replace(/^\s*--.*$/gm, "").split(/;\s*$/m).map((s) => s.trim()).filter(Boolean);

const auth = "Basic " + Buffer.from(`${user}:${pass}`).toString("base64");
const base = `https://${host.replace(/^https?:\/\//, "").replace(/\/$/, "")}`;

for (const sql of statements) {
  const isRead = /^(select|show|describe)\b/i.test(sql);
  const res = await fetch(`${base}/api/v2/${isRead ? "query/rows" : "exec"}`, {
    method: "POST",
    headers: { Authorization: auth, "Content-Type": "application/json" },
    body: JSON.stringify(noDb ? { sql } : { sql, database }),
  });
  const body = await res.text();
  const first = sql.split("\n")[0].slice(0, 70);
  if (!res.ok) { console.error(`FAIL ${res.status}: ${first}\n  ${body.slice(0, 300)}`); process.exit(1); }
  if (isRead) {
    const rows = JSON.parse(body).results?.[0]?.rows ?? [];
    console.log(`ok: ${first}`); console.log(JSON.stringify(rows, null, 1));
  } else console.log(`ok: ${first}`);
}
