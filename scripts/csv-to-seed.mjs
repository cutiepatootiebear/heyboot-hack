#!/usr/bin/env node
// Convert the catalog CSV (exported from the Google Sheet) into db/seed_catalog.sql.
// Usage: node scripts/csv-to-seed.mjs path/to/catalog.csv > db/seed_catalog.sql
//
// Expected header (order doesn't matter, case-insensitive):
//   item, store, price, mil_discount_pct, url, captured_at, in_stock
// Rows that fail validation are reported on stderr and the script exits 1,
// so a bad price or missing URL never reaches the demo.

import { readFileSync } from "node:fs";

const COLS = ["item", "store", "price", "mil_discount_pct", "url", "captured_at", "in_stock"];

function parseCsv(text) {
  const rows = [];
  let row = [], field = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== "")) rows.push(row);
  return rows;
}

const sqlStr = (s) => "'" + s.replace(/\\/g, "\\\\").replace(/'/g, "''") + "'";

function toDatetime(raw) {
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().replace("T", " ").replace("Z", ""); // UTC, DATETIME(6)-compatible
}

function toBool(raw) {
  const v = raw.trim().toLowerCase();
  if (["true", "yes", "y", "1", "in stock"].includes(v)) return "TRUE";
  if (["false", "no", "n", "0", "out of stock", "oos"].includes(v)) return "FALSE";
  return null;
}

const path = process.argv[2];
if (!path) { console.error("usage: node scripts/csv-to-seed.mjs catalog.csv"); process.exit(2); }

const [header, ...data] = parseCsv(readFileSync(path, "utf8").replace(/^﻿/, ""));
const idx = Object.fromEntries(header.map((h, i) => [h.trim().toLowerCase(), i]));
const missing = COLS.filter((c) => !(c in idx));
if (missing.length) { console.error(`missing columns: ${missing.join(", ")}`); process.exit(1); }

const errors = [], values = [], seen = new Set();
data.forEach((r, n) => {
  const line = n + 2;
  const get = (c) => (r[idx[c]] ?? "").trim();
  const item = get("item"), store = get("store"), url = get("url");
  const price = Number(get("price").replace(/[$,]/g, ""));
  const pctRaw = get("mil_discount_pct").replace("%", "");
  const pct = pctRaw === "" ? 0 : Number(pctRaw);
  const capturedAt = toDatetime(get("captured_at"));
  const inStock = toBool(get("in_stock") || "true");

  const bad = [];
  if (!item) bad.push("item empty");
  if (!store) bad.push("store empty");
  if (!(price > 0)) bad.push(`price "${get("price")}"`);
  if (!(pct >= 0 && pct <= 100)) bad.push(`mil_discount_pct "${pctRaw}"`);
  if (!/^https?:\/\//.test(url)) bad.push("url missing or not http(s)");
  if (!capturedAt) bad.push(`captured_at "${get("captured_at")}"`);
  if (!inStock) bad.push(`in_stock "${get("in_stock")}"`);
  const key = `${item}\u0000${store}`;
  if (seen.has(key)) bad.push("duplicate (item, store)");
  seen.add(key);

  if (bad.length) { errors.push(`line ${line}: ${bad.join("; ")}`); return; }
  values.push(`  (${sqlStr(item)}, ${sqlStr(store)}, ${price.toFixed(2)}, ${pct.toFixed(2)}, ${sqlStr(url)}, '${capturedAt}', ${inStock})`);
});

if (errors.length) { console.error(errors.join("\n")); process.exit(1); }
if (!values.length) { console.error("no rows"); process.exit(1); }

process.stdout.write(
  `-- Generated from ${path.split("/").pop()} on ${new Date().toISOString()} (${values.length} rows). Demo data.\n` +
  `REPLACE INTO catalog (item, store, price, mil_discount_pct, url, captured_at, in_stock) VALUES\n` +
  values.join(",\n") + ";\n",
);
console.error(`ok: ${values.length} rows`);
