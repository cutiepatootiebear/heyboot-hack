// Server-side guard: strip the model's notes-to-self from the start of a reply before it reaches
// the user on any channel (web chat or iMessage). Only leading paragraphs/sentences that look like
// planning are removed; anything addressed to the user is kept. Returns what was dropped for the audit log.

const NOTE_PATTERNS: RegExp[] = [
  /\bask (once|first|the user|for (the |their |his )?(missing )?sizes?)\b/i,
  /^(missing|need(ed)?|still need|lacking)\b[^?]*\b(sizes?|info|information|details)\b[^?]*\.?$/i,
  /\b(note to self|my plan|plan:|next step|then search|then propose|before searching)\b/i,
  /^(let me|i'?ll now|i will now|i should|i need to|now i|first,? i)\b/i,
  /^(search|check|call|recall|save|propose|ask)\b[^?]*\.$/i, // bare imperative fragment, e.g. "Ask once."
];

const addressesUser = (t: string) => /\b(you|your|you're|you'll)\b/i.test(t) || t.trim().endsWith("?");

function isNote(chunk: string): boolean {
  const t = chunk.trim();
  if (!t || t.length > 140 || addressesUser(t)) return false;
  return NOTE_PATTERNS.some((p) => p.test(t));
}

export function stripNotes(reply: string): { text: string; dropped: string[] } {
  const dropped: string[] = [];
  let paras = reply.split(/\n\s*\n/);
  // 1) whole leading paragraphs that are notes
  while (paras.length > 1 && isNote(paras[0])) dropped.push(paras.shift()!.trim());
  // 2) leading sentences inside the first paragraph that are notes
  if (paras.length) {
    const sentences = paras[0].split(/(?<=[.!])\s+(?=[A-Z0-9])/);
    while (sentences.length > 1 && isNote(sentences[0])) dropped.push(sentences.shift()!.trim());
    paras[0] = sentences.join(" ");
  }
  const text = paras.join("\n\n").trim();
  return { text: text || reply.trim(), dropped };
}
