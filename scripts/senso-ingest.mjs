#!/usr/bin/env node
// Ingest one public source page into Senso and print the SOURCES entry to add to
// convex/integrations/senso.ts (Keanu's list of official pages that may be cited).
//
// Usage:
//   node --env-file=.env.local scripts/senso-ingest.mjs --url <public url> --title "<Store> <page title>"
//   ... --file <saved page .html/.txt>   # for sites that block automated fetches (e.g. SOI-West)
//
// The title must start with the store/organization name: citations match stores by title prefix.
import { readFileSync } from "node:fs";

const arg = (k) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : undefined; };
const url = arg("url"), title = arg("title"), file = arg("file");
const KEY = process.env.SENSO_API_KEY;
if (!KEY) { console.error("SENSO_API_KEY missing (add it to .env.local)"); process.exit(2); }
if (!url || !title) { console.error("need --url and --title"); process.exit(2); }
const BASE = (process.env.SENSO_BASE_URL || "https://apiv2.senso.ai/api/v1").replace(/\/$/, "");
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36";

function pageText(html) {
  const main = html.match(/<main[\s\S]*?<\/main>/i)?.[0] ?? html;
  return main
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<noscript[\s\S]*?<\/noscript>|<svg[\s\S]*?<\/svg>|<nav[\s\S]*?<\/nav>|<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<\/(p|div|li|h\d|tr|br)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#39;|&rsquo;/g, "'").replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim().slice(0, 20000);
}

async function api(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "X-API-Key": KEY, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

const raw = file ? readFileSync(file, "utf8") : await (await fetch(url, { headers: { "User-Agent": UA } })).text();
const text = /<html|<body|<div/i.test(raw) ? pageText(raw) : raw.trim().slice(0, 20000);
if (text.length < 200) { console.error(`page text too short (${text.length} chars): ${text.slice(0, 200)}`); process.exit(1); }

const retrievedAt = new Date().toISOString().slice(0, 10);
const doc = await api("POST", "/org/kb/raw", { title, summary: url, text: `Source: ${url}\nRetrieved: ${retrievedAt}\n\n${text}` });
process.stderr.write(`ingesting ${title} (${text.length} chars) as ${doc.id} `);
let status = doc.processing_status;
for (let i = 0; i < 90 && status !== "complete" && status !== "failed"; i++) {
  await new Promise((r) => setTimeout(r, 2000));
  status = (await api("GET", `/org/content/${doc.id}`)).processing_status;
  process.stderr.write(".");
}
process.stderr.write(` ${status}\n`);
if (status !== "complete") process.exit(1);
console.log(`  "${doc.id}": {\n    title: ${JSON.stringify(title)},\n    url: ${JSON.stringify(url)},\n    retrievedAt: "${retrievedAt}",\n  },`);
