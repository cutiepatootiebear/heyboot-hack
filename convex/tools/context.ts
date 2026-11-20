import type { Auditor } from "../lib/audit";
import { lookup, sensoConfigured } from "../integrations/senso";

// What the model sees: the answer and where it came from.
export type ContextSource = { title: string; url: string; retrievedAt: string };

export type ContextResult = {
  answer: string | null;
  sources: Array<ContextSource>;
  notFound: boolean;
  backend: string;
  error?: string;
};

// Senso lookup for the lookup_context tool. The search itself (scoping to the official
// source pages, today's date, NOT_FOUND handling) lives in ../integrations/senso.ts.
export async function lookupContext(question: string, audit: Auditor): Promise<ContextResult> {
  let result: ContextResult;
  // Senso's own ids for each cited chunk, kept for the audit trail only.
  let matches: Array<{ title: string; content_id: string; version_id: string | null; score: number }> = [];

  if (!sensoConfigured()) {
    result = { answer: null, sources: [], notFound: true, backend: "unconfigured" };
  } else {
    try {
      const found = await lookup(question);
      result = {
        answer: found.answer,
        sources: found.sources.map(({ title, url, retrievedAt }) => ({ title, url, retrievedAt })),
        notFound: found.answer === null,
        backend: "senso",
      };
      matches = found.sources.map((s) => ({
        title: s.title,
        content_id: s.contentId,
        version_id: s.versionId,
        score: s.score,
      }));
    } catch (err) {
      result = {
        answer: null,
        sources: [],
        notFound: true,
        backend: "error",
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  await audit.log(
    "lookup_context",
    { question },
    { ...result, matches },
    result.sources.map((source) => ({
      title: source.title,
      url: source.url,
      retrieved_at: source.retrievedAt,
    })),
  );
  return result;
}
