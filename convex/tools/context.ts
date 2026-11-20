import type { Auditor } from "../lib/audit";

const TIMEOUT_MS = 8000;

export type SensoSource = { title: string; url: string; retrievedAt: string };

export type ContextResult = {
  answer: string | null;
  sources: Array<SensoSource>;
  notFound: boolean;
  backend: string;
  error?: string;
};

export async function lookupContext(question: string, audit: Auditor): Promise<ContextResult> {
  const base = process.env.SENSO_BASE_URL;
  const key = process.env.SENSO_API_KEY;
  let result: ContextResult;

  if (!base || !key) {
    result = { answer: null, sources: [], notFound: true, backend: "unconfigured" };
  } else {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const path = process.env.SENSO_LOOKUP_PATH ?? "/lookup";
      const response = await fetch(`${base.replace(/\/$/, "")}${path}`, {
        method: "POST",
        headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
        body: JSON.stringify({ question }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Senso ${response.status}`);
      const body = (await response.json()) as { answer?: string | null; sources?: Array<SensoSource> };
      result = {
        answer: typeof body.answer === "string" && body.answer.trim() ? body.answer : null,
        sources: Array.isArray(body.sources) ? body.sources.slice(0, 8) : [],
        notFound: !(typeof body.answer === "string" && body.answer.trim()),
        backend: "senso",
      };
    } catch (err) {
      result = {
        answer: null,
        sources: [],
        notFound: true,
        backend: "error",
        error: err instanceof Error ? err.message : String(err),
      };
    } finally {
      clearTimeout(timer);
    }
  }

  await audit.log(
    "lookup_context",
    { question },
    result,
    result.sources.map((source) => ({
      title: source.title,
      url: source.url,
      captured_at: source.retrievedAt,
    })),
  );
  return result;
}
