// Cognee Cloud memory (plain fetch; no Convex functions here). Keanu owns this file;
// first version written on main. Callers must treat failures as "use the Convex fallback".
//
// Env: COGNEE_API_KEY, COGNEE_BASE_URL (per-workspace, e.g. https://tenant-<id>.aws.cognee.ai),
// COGNEE_TENANT_ID (sent as X-Tenant-Id). All three are on platform.cognee.ai → API Keys → Connection.
// Docs: https://docs.cognee.ai/cognee-cloud/http-api.md

const TIMEOUT_MS = 8000;

export type CogneeMemory = { key: string; value: string; savedAt: string };

function config(): { base: string; headers: Record<string, string> } | null {
  const key = process.env.COGNEE_API_KEY;
  const base = process.env.COGNEE_BASE_URL;
  if (!key || !base) return null;
  const headers: Record<string, string> = { "X-Api-Key": key };
  if (process.env.COGNEE_TENANT_ID) headers["X-Tenant-Id"] = process.env.COGNEE_TENANT_ID;
  return { base: base.replace(/\/$/, ""), headers };
}

export const cogneeConfigured = () => config() !== null;

// One dataset per user so memories never mix between users.
export const datasetFor = (userId: string) => `heyboot_user_${userId.replace(/[^a-zA-Z0-9]/g, "")}`;

async function withTimeout(url: string, init: RequestInit): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

// Store one fact. Cognee processes it in the background (remember = add + cognify).
export async function save(userId: string, key: string, value: string): Promise<{ id: string }> {
  const c = config();
  if (!c) throw new Error("Cognee not configured");
  const form = new FormData();
  form.append("raw_data", `${key}: ${value}`);
  form.append("datasetName", datasetFor(userId));
  const res = await withTimeout(`${c.base}/api/v1/remember`, {
    method: "POST",
    headers: c.headers,
    body: form,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Cognee remember ${res.status}: ${text.slice(0, 200)}`);
  let id = "";
  try {
    const body = JSON.parse(text) as Record<string, unknown>;
    id = String(body.pipeline_run_id ?? body.id ?? "");
  } catch {
    /* non-JSON success body */
  }
  return { id };
}

// Ask the user's memory graph a question. Returns [] when nothing useful comes back.
export async function recall(userId: string, query: string): Promise<CogneeMemory[]> {
  const c = config();
  if (!c) throw new Error("Cognee not configured");
  const res = await withTimeout(`${c.base}/api/v1/search`, {
    method: "POST",
    headers: { ...c.headers, "Content-Type": "application/json" },
    body: JSON.stringify({ query, search_type: "GRAPH_COMPLETION", datasets: [datasetFor(userId)] }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Cognee search ${res.status}: ${text.slice(0, 200)}`);

  // The response shape isn't documented; collect any answer strings we can find.
  const answers: string[] = [];
  const walk = (x: unknown, depth = 0) => {
    if (depth > 4 || x == null) return;
    if (typeof x === "string") {
      if (x.trim()) answers.push(x.trim());
    } else if (Array.isArray(x)) {
      x.forEach((y) => walk(y, depth + 1));
    } else if (typeof x === "object") {
      const o = x as Record<string, unknown>;
      for (const k of ["search_result", "result", "answer", "text", "results"]) if (k in o) walk(o[k], depth + 1);
    }
  };
  try {
    walk(JSON.parse(text));
  } catch {
    if (text.trim()) answers.push(text.trim());
  }
  const now = new Date().toISOString();
  const useful = answers.filter((a) => !/^(i don't know|no (relevant )?(information|context)|none)\b/i.test(a));
  return useful.slice(0, 5).map((value, i) => ({ key: i === 0 ? "cognee_answer" : `cognee_answer_${i + 1}`, value, savedAt: now }));
}
