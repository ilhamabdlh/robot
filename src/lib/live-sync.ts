import type { LivePayload } from "./types";

export type LiveCommand = "answer" | "clear" | "solve";

export type LiveChannelMessage =
  | { kind: "state"; payload: LivePayload }
  | { kind: "command"; command: LiveCommand };

export function liveStorageKey(sessionId: string) {
  return `robot.live.${sessionId}`;
}

export function channelName(sessionId: string) {
  return `robot-live-${sessionId}`;
}

function isLivePayload(value: unknown): value is LivePayload {
  return Boolean(
    value &&
      typeof value === "object" &&
      "sessionId" in value &&
      "updatedAt" in value,
  );
}

export function parseChannelMessage(data: unknown): LiveChannelMessage | null {
  if (!data || typeof data !== "object") return null;
  const message = data as Partial<LiveChannelMessage> & LivePayload;
  if (
    message.kind === "command" &&
    (message.command === "answer" || message.command === "clear" || message.command === "solve")
  ) {
    return { kind: "command", command: message.command };
  }
  if (message.kind === "state" && isLivePayload(message.payload)) {
    return { kind: "state", payload: message.payload };
  }
  if (isLivePayload(message)) {
    return { kind: "state", payload: message };
  }
  return null;
}

export function writeLivePayload(payload: LivePayload) {
  localStorage.setItem(liveStorageKey(payload.sessionId), JSON.stringify(payload));
  const channel = new BroadcastChannel(channelName(payload.sessionId));
  const message: LiveChannelMessage = { kind: "state", payload };
  channel.postMessage(message);
  channel.close();
}

export function sendLiveCommand(sessionId: string, command: LiveCommand) {
  const channel = new BroadcastChannel(channelName(sessionId));
  const message: LiveChannelMessage = { kind: "command", command };
  channel.postMessage(message);
  channel.close();
}

export function readLivePayload(sessionId: string): LivePayload | null {
  try {
    const raw = localStorage.getItem(liveStorageKey(sessionId));
    if (!raw) return null;
    return JSON.parse(raw) as LivePayload;
  } catch {
    return null;
  }
}
