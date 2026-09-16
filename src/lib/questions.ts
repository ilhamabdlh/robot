import type { CueKind } from "./types";

const QUESTION_CUE =
  /(?:^|[.!?]\s+|,\s*)(?:apa(?:kah)?|mengapa|kenapa|bagaimana|gimana|kapan|siapa|di\s?mana|berapa|bisakah|bolehkah|tolong|jelaskan|ceritakan|menurut (?:anda|kamu)|why|what'?s|whats|what (?:is|are|do|does|did|would|should|was|were)|when|where|who|how|can you|could you|would you|tell me|explain|do you|are you|is there|have you)\b/i;

const SMALLTALK =
  /^(ok(ay|e)?|yeah|yep|yup|yes|no|nah|no worries|sure|thanks|thank you|alright|got it|i see|hmm+|uh+|um+|ah+|let'?s (test|try|see)( it)?( again)?( then)?|wait|hold on|one (sec|second|moment)|hello|hi|hey|good (morning|afternoon|evening)|cool|nice|great|perfect|exactly|right|oh)\.?$/i;

const CLAIM =
  /\b(should(?:n'?t)?|must|need to|have to|always|never|better|worse|actually|probably|i think|we should|we need|the (problem|issue|point) is|in my (view|experience)|according to|harus|perlu|jangan|lebih baik|masalahnya|menurut saya|saya rasa|kita (harus|perlu)|sebaiknya|penting)\b/i;

export type OtherCue = {
  kind: CueKind;
  text: string;
};

function normalizeSpeech(text: string) {
  return text
    .replace(/[''′]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractQuestion(text: string): string | null {
  const t = normalizeSpeech(text);
  if (t.length < 8) return null;

  if (/[?？]/.test(t)) {
    const withMark = t
      .split(/(?<=[?？])\s*/)
      .map((part) => part.trim())
      .filter((part) => /[?？]/.test(part) && part.length >= 8);
    if (withMark.length > 0) return withMark[withMark.length - 1];
  }

  const matches = [...t.matchAll(new RegExp(QUESTION_CUE, "gi"))];
  if (matches.length === 0) return null;

  const last = matches[matches.length - 1];
  const span = t.slice(last.index).replace(/^[,.!?]\s*/, "").trim();
  if (span.split(" ").length < 3) return null;
  return span;
}

export function looksLikeQuestion(text: string): boolean {
  return extractQuestion(text) !== null;
}

export function extractStatement(text: string): string | null {
  if (extractQuestion(text)) return null;
  const t = normalizeSpeech(text);
  if (t.length < 16 || SMALLTALK.test(t)) return null;

  const sentences = t.split(/(?<=[.!?])\s+/).filter((part) => part.trim().length > 0);
  const last = (sentences.slice(-2).join(" ").trim() || t).replace(/^[,.]\s*/, "");
  if (SMALLTALK.test(last)) return null;

  const words = last.split(" ").length;
  if (words >= 10) return last;
  if (words >= 6 && CLAIM.test(last)) return last;
  return null;
}

export function classifyOtherTurn(text: string): OtherCue | null {
  const question = extractQuestion(text);
  if (question) return { kind: "question", text: question };
  const statement = extractStatement(text);
  if (statement) return { kind: "statement", text: statement };
  return null;
}

export function shouldAutoRespond(opts: {
  cue: OtherCue;
  lastAnswered: string;
  lastFiredAt: number;
  now?: number;
}): boolean {
  const now = opts.now ?? Date.now();
  const text = opts.cue.text.trim();
  if (!text) return false;
  if (text === opts.lastAnswered) return false;
  if (
    opts.lastAnswered &&
    text.startsWith(opts.lastAnswered) &&
    text.length - opts.lastAnswered.length < 12
  ) {
    return now - opts.lastFiredAt > 1200;
  }
  const cooldown = opts.cue.kind === "statement" ? 8000 : 4500;
  if (now - opts.lastFiredAt < cooldown) return false;
  return true;
}

export function shouldAutoAnswer(opts: {
  text: string;
  lastAnswered: string;
  lastFiredAt: number;
  now?: number;
}): boolean {
  const cue = classifyOtherTurn(opts.text);
  if (!cue) return false;
  return shouldAutoRespond({ ...opts, cue });
}
