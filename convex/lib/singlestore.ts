// SingleStore over its HTTPS Data API (plain fetch; works in either Convex runtime).
// Always pass user/model input through `args` (? placeholders), never string-build SQL.

type Arg = string | number | boolean | null;

function conn() {
  const host = process.env.SINGLESTORE_HOST;
  const user = process.env.SINGLESTORE_USER;
  const pass = process.env.SINGLESTORE_PASSWORD;
  const database = process.env.SINGLESTORE_DATABASE;
  if (!host || !user || !pass || !database) throw new Error("SingleStore env vars missing");
  return {
    base: `https://${host.replace(/^https?:\/\//, "").replace(/\/$/, "")}/api/v2`,
    auth: "Basic " + btoa(`${user}:${pass}`),
    database,
  };
}

async function call(path: "query/rows" | "exec", sql: string, args: Arg[]) {
  const { base, auth, database } = conn();
  const res = await fetch(`${base}/${path}`, {
    method: "POST",
    headers: { Authorization: auth, "Content-Type": "application/json" },
    body: JSON.stringify({ sql, args, database }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`SingleStore ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text) as unknown;
}

export async function s2Query<T = Record<string, unknown>>(sql: string, args: Arg[] = []): Promise<T[]> {
  const body = (await call("query/rows", sql, args)) as { results?: { rows?: T[] }[] };
  return body.results?.[0]?.rows ?? [];
}

export async function s2Exec(sql: string, args: Arg[] = []): Promise<void> {
  await call("exec", sql, args);
}
