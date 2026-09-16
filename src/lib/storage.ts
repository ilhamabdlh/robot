import { EMPTY_KNOWLEDGE, type MeetingSession } from "./types";

const KEY = "robot.sessions.v1";

function canUseStorage() {
  return typeof window !== "undefined";
}

export function listSessions(): MeetingSession[] {
  if (!canUseStorage()) return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as MeetingSession[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function getSession(id: string): MeetingSession | null {
  return listSessions().find((item) => item.id === id) ?? null;
}

export function saveSession(session: MeetingSession) {
  if (!canUseStorage()) return;
  const next = listSessions().filter((item) => item.id !== session.id);
  next.unshift(session);
  localStorage.setItem(KEY, JSON.stringify(next));
}

export function deleteSession(id: string) {
  if (!canUseStorage()) return;
  localStorage.setItem(
    KEY,
    JSON.stringify(listSessions().filter((item) => item.id !== id)),
  );
}

export function createSessionDraft(): MeetingSession {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    title: "Sesi meeting baru",
    createdAt: now,
    updatedAt: now,
    language: "id",
    model: "gpt-4o-mini",
    autoAnswer: true,
    knowledge: { ...EMPTY_KNOWLEDGE },
  };
}
