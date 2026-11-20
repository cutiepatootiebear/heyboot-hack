// Crisis check (ported from Ben's agent-loop branch). Runs on every non-YES message before the
// tool loop; the YES fast path / purchase flow never calls it. Haiku answers YES/NO; if Haiku is
// unavailable, a keyword check decides. Plain helper (no Convex functions); imported by agent/loop.ts.
import Anthropic from "@anthropic-ai/sdk";

const CRISIS_MODEL = "claude-haiku-5-5";

export const CRISIS_REPLY =
  "I'm sorry you're going through this. Help is free and confidential: call or text 988 and press 1 for the Veterans Crisis Line, or text 838255. If you're in immediate danger, call 911.";

const CLASSIFY_PROMPT = `Decide whether this text message is a genuine mental-health crisis or an explicit ask for crisis help. Reply with exactly YES or NO and nothing else. Reply YES only for self-harm intent, suicidal thoughts, an immediate danger to life, or a direct request for a crisis line. Complaints about gear, prices, deadlines, or jokes are NO.`;

const CRISIS_PATTERNS: RegExp[] = [
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

export const looksLikeCrisis = (text: string) => CRISIS_PATTERNS.some((p) => p.test(text));

export type CrisisResult = { crisis: boolean; backend: "haiku" | "keywords"; reason: string };

export async function classify(text: string): Promise<CrisisResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { crisis: looksLikeCrisis(text), backend: "keywords", reason: "ANTHROPIC_API_KEY not set" };
  }
  try {
    const client = new Anthropic({ timeout: 6000, maxRetries: 1 });
    const response = await client.messages.create({
      model: CRISIS_MODEL,
      max_tokens: 16,
      thinking: { type: "disabled" },
      system: CLASSIFY_PROMPT,
      messages: [{ role: "user", content: text }],
    });
    if (response.stop_reason === "refusal") {
      return { crisis: looksLikeCrisis(text), backend: "keywords", reason: "Haiku declined; keyword check used" };
    }
    const answer = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim()
      .toUpperCase();
    // Either signal counts: a YES from Haiku, or an explicit crisis phrase.
    const yes = /(^|\W)YES(\W|$)/.test(answer);
    return { crisis: yes || looksLikeCrisis(text), backend: "haiku", reason: answer.slice(0, 80) || "no answer" };
  } catch (err) {
    return {
      crisis: looksLikeCrisis(text),
      backend: "keywords",
      reason: `Haiku unavailable: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
