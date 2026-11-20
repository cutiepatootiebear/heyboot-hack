import { v } from "convex/values";
import { internalAction } from "./_generated/server";

const CRISIS_MODEL = process.env.CRISIS_MODEL ?? "claude-haiku-4-5";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const TIMEOUT_MS = 6000;

export const CRISIS_REPLY =
  "I'm sorry you're going through this. Help is free and confidential: call or text 988 and press 1 for the Veterans Crisis Line, or text 838255. If you're in immediate danger, call 911.";

const CLASSIFY_PROMPT = `Decide whether this text message is a genuine mental-health crisis or an explicit ask for crisis help. Reply with exactly YES or NO and nothing else. Reply YES only for self-harm intent, suicidal thoughts, an immediate danger to life, or a direct request for a crisis line. Complaints about gear, prices, deadlines, or jokes are NO.`;

const CRISIS_PATTERNS: Array<RegExp> = [
  /\bkill myself\b/i,
  /\bend my life\b/i,
  /\bsuicid(e|al)\b/i,
  /\bwant to die\b/i,
  /\bno reason to live\b/i,
  /\bhurt myself\b/i,
  /\bself[- ]harm\b/i,
  /\b(988|838255)\b/,
  /\bcrisis line\b/i,
  /\boverdose\b/i,
];

export function looksLikeCrisis(text: string): boolean {
  return CRISIS_PATTERNS.some((pattern) => pattern.test(text));
}

export type CrisisResult = {
  crisis: boolean;
  backend: "haiku" | "keywords";
  reason: string;
};

async function withTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function classify(text: string): Promise<CrisisResult> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (key) {
    try {
      const response = await withTimeout(ANTHROPIC_URL, {
        method: "POST",
        headers: {
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
          "anthropic-beta": "server-side-fallback-2026-07-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: CRISIS_MODEL,
          max_tokens: 16,
          system: CLASSIFY_PROMPT,
          messages: [{ role: "user", content: text }],
          fallbacks: "default",
        }),
      });
      const body = (await response.json()) as {
        content?: Array<{ type: string; text?: string }>;
        error?: { message?: string };
      };
      if (!response.ok) throw new Error(`Anthropic ${response.status}: ${body.error?.message ?? "unknown error"}`);
      const answer = (body.content ?? [])
        .filter((block) => block.type === "text")
        .map((block) => block.text ?? "")
        .join("")
        .trim()
        .toUpperCase();
      return { crisis: /(^|\W)YES(\W|$)/.test(answer), backend: "haiku", reason: answer.slice(0, 80) || "no answer" };
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      return { crisis: looksLikeCrisis(text), backend: "keywords", reason: `Haiku unavailable: ${reason}` };
    }
  }
  return { crisis: looksLikeCrisis(text), backend: "keywords", reason: "ANTHROPIC_API_KEY not set" };
}

export const classifyAction = internalAction({
  args: { text: v.string() },
  handler: async (_ctx, args) => classify(args.text),
});
