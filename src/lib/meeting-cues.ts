import type { KnowledgePack } from "./types";

export type MeetingPeople = {
  userNames: string[];
  otherNames: string[];
  isPanel: boolean;
};

const DIRECTED_AT_USER =
  /\b(anda|kamu|you|your|yours|yourself|y'all)\b/i;

const DIRECTED_QUESTION =
  /\b(can|could|would|will|do|did|are|were|have|has)\s+you\b|\bwhat\s+(?:do|did|would)\s+you\b|\bhow\s+(?:do|did|would|have)\s+you\b|\btell\s+(?:me|us)\s+about\s+(?:your|you)\b|\bwalk\s+(?:me\s+)?through\s+(?:your|what\s+you)\b|\bmenurut\s+(?:anda|kamu)\b|\b(bisa|boleh|tolong)\s+(?:anda|kamu)\b|\bapa\s+(?:menurut|pendapat)\s+(?:anda|kamu)\b|\bwhy\s+do\s+you\b|\bwhere\s+do\s+you\b/i;

const ROOM_DIRECTED =
  /\b(anyone|someone|everybody|everyone|siapa\s+yang|ada\s+yang|can\s+someone|could\s+someone)\b/i;

const SIDE_CONVERSATION =
  /\b(as\s+i\s+(?:said|mentioned|told)|let'?s\s+(?:move\s+on|wrap\s+up|continue|switch)|thank(?:s| you)\s+(?:everyone|all|team|guys)|terima\s+kasih\s+semua|kita\s+lanjut|before\s+we\s+move\s+on)\b/i;

function normalizeName(value: string) {
  const trimmed = value
    .trim()
    .replace(/^[-*•\d.)\s]+/, "")
    .replace(/\s*\([^)]*\)\s*$/, "")
    .replace(/\s*[-–:].*$/, "")
    .trim();
  const comma = trimmed.split(",")[0]?.trim();
  return comma || trimmed;
}

function uniqueNames(names: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of names) {
    const name = normalizeName(raw);
    if (!name || name.length < 2) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

function looksLikeName(value: string) {
  const name = normalizeName(value);
  if (!name || name.length < 2 || name.length > 40) return false;
  if (name.split(/\s+/).length > 4) return false;
  return true;
}

function parseBulletNames(text: string) {
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const labeled = line.match(/^(?:nama\s+anda|your\s+name)\s*[:=-]\s*(.+)$/i);
      if (labeled) return { kind: "user" as const, name: labeled[1] };
      if (/^[-*•]/.test(line)) return { kind: "other" as const, name: line };
      const dash = line.match(/^([^(-–:]+?)\s*[-–:(].+$/);
      if (dash) return { kind: "other" as const, name: dash[1] };
      return { kind: "other" as const, name: line };
    })
    .filter((item) => looksLikeName(item.name));
}

export function parseMeetingPeople(knowledge: KnowledgePack): MeetingPeople {
  const userNames: string[] = [];
  const otherNames: string[] = [];

  if (knowledge.participants.trim()) {
    for (const item of parseBulletNames(knowledge.participants)) {
      if (item.kind === "user") userNames.push(item.name);
      else otherNames.push(item.name);
    }
  }

  if (knowledge.interviewer.trim()) {
    const firstLine = knowledge.interviewer.trim().split(/\n+/)[0] ?? "";
    if (looksLikeName(firstLine)) {
      otherNames.push(firstLine);
    }
  }

  if (knowledge.userName?.trim() && looksLikeName(knowledge.userName)) {
    userNames.push(knowledge.userName.trim());
  }

  const user = uniqueNames(userNames);
  const others = uniqueNames(otherNames).filter(
    (name) => !user.some((mine) => mine.toLowerCase() === name.toLowerCase()),
  );

  const isPanel =
    others.length > 1 ||
    (others.length === 1 && knowledge.participants.trim().length > 0);

  return { userNames: user, otherNames: others, isPanel };
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function addressesName(text: string, name: string) {
  const safe = escapeRegExp(name);
  const patterns = [
    new RegExp(`\\b${safe}\\b[,?!]`, "i"),
    new RegExp(`[,]\\s*${safe}\\b`, "i"),
    new RegExp(`\\b(?:hi|hey|hello|halo)\\s+${safe}\\b`, "i"),
    new RegExp(`\\b${safe}\\s*[,?!]`, "i"),
    new RegExp(`\\b(?:what do you think|menurut|menurutmu),?\\s+${safe}\\b`, "i"),
    new RegExp(`\\b${safe},?\\s+(?:what do you think|gimana|bagaimana)\\b`, "i"),
  ];
  return patterns.some((pattern) => pattern.test(text));
}

function addressesOtherParticipant(text: string, people: MeetingPeople) {
  const matched = people.otherNames.filter((name) => addressesName(text, name));
  if (matched.length === 0) return null;
  const alsoUser = people.userNames.some((name) => addressesName(text, name));
  if (alsoUser) return null;
  return matched[0];
}

function addressesUserByName(text: string, people: MeetingPeople) {
  return people.userNames.some((name) => addressesName(text, name));
}

export function isDirectedAtUser(text: string, people: MeetingPeople) {
  const t = text.trim();
  if (!t) return false;
  if (SIDE_CONVERSATION.test(t)) return false;

  const other = addressesOtherParticipant(t, people);
  if (other) return false;

  if (addressesUserByName(t, people)) return true;
  if (DIRECTED_AT_USER.test(t)) return true;
  if (DIRECTED_QUESTION.test(t)) return true;
  if (ROOM_DIRECTED.test(t)) return true;

  if (!people.isPanel) return true;

  if (/[?？]/.test(t) || DIRECTED_QUESTION.test(t)) {
    return DIRECTED_AT_USER.test(t) || ROOM_DIRECTED.test(t);
  }

  return false;
}

export function meetingCueHint(text: string, people: MeetingPeople) {
  if (!people.isPanel) return "";
  if (isDirectedAtUser(text, people)) return "";
  const other = addressesOtherParticipant(text, people);
  if (other) {
    return `Ucapan ke ${other}, bukan ke Anda. Auto jawab dilewati. Tekan A jika tetap perlu dijawab.`;
  }
  return "Ucapan antar peserta lain. Auto jawab dilewati. Tekan A jika tetap perlu dijawab.";
}
