"use client";

import { useEffect, useState } from "react";
import type { LivePayload, ResponseEntry } from "@/lib/types";
import {
  channelName,
  parseChannelMessage,
  readLivePayload,
  sendLiveCommand,
} from "@/lib/live-sync";
import { entryCuePrefix, entryKindLabel } from "@/lib/response-label";
import { shortcutAction } from "@/lib/shortcuts";

function historyOf(payload: LivePayload | null): ResponseEntry[] {
  return payload?.history ?? [];
}

export function OverlayView({ sessionId, title }: { sessionId: string; title: string }) {
  const [payload, setPayload] = useState<LivePayload | null>(null);
  const [compact, setCompact] = useState(true);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setPayload(readLivePayload(sessionId));
    const channel = new BroadcastChannel(channelName(sessionId));
    channel.onmessage = (event) => {
      const message = parseChannelMessage(event.data);
      if (message?.kind !== "state") return;
      setPayload((prev) => {
        const prevHead = prev?.history?.[0]?.id;
        const nextHead = message.payload.history?.[0]?.id;
        if (prevHead && nextHead && prevHead !== nextHead) {
          setIndex((value) => value + 1);
        }
        return message.payload;
      });
    };

    function onStorage(event: StorageEvent) {
      if (event.key?.includes(sessionId) && event.newValue) {
        try {
          const next = JSON.parse(event.newValue) as LivePayload;
          setPayload((prev) => {
            const prevHead = prev?.history?.[0]?.id;
            const nextHead = next.history?.[0]?.id;
            if (prevHead && nextHead && prevHead !== nextHead) {
              setIndex((value) => value + 1);
            }
            return next;
          });
        } catch {
          /* ignore */
        }
      }
    }

    function onKey(event: KeyboardEvent) {
      if (event.key === "ArrowLeft" || event.key === "[") {
        event.preventDefault();
        setIndex((value) => value + 1);
        return;
      }
      if (event.key === "ArrowRight" || event.key === "]") {
        event.preventDefault();
        setIndex((value) => Math.max(0, value - 1));
        return;
      }
      const action = shortcutAction(event);
      if (!action) return;
      event.preventDefault();
      sendLiveCommand(sessionId, action);
    }

    window.addEventListener("storage", onStorage);
    window.addEventListener("keydown", onKey);
    return () => {
      channel.close();
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("keydown", onKey);
    };
  }, [sessionId]);

  const items = historyOf(payload);
  const safeIndex = Math.min(index, Math.max(0, items.length - 1));
  const current = items[safeIndex];

  return (
    <div className="flex min-h-screen flex-col bg-zinc-950 p-3 text-zinc-100">
      <header className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] tracking-wide text-teal-300/80 uppercase">Overlay</p>
          <h1 className="text-sm font-medium">{title}</h1>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`size-2 rounded-full ${payload?.listening ? "bg-teal-400 animate-pulse" : "bg-zinc-600"}`}
          />
          <button
            type="button"
            onClick={() => setCompact((v) => !v)}
            className="rounded-lg border border-white/10 px-2 py-1 text-[11px] text-zinc-300"
          >
            {compact ? "Riwayat" : "Focus"}
          </button>
        </div>
      </header>

      {compact ? (
        <>
          {current ? (
            <p className="mt-3 text-xs leading-5 text-zinc-400">
              {entryCuePrefix(current.cueKind, current.source)}
              {current.cue}
            </p>
          ) : payload?.lastQuestion ? (
            <p className="mt-3 text-xs leading-5 text-zinc-400">
              {payload.lastCueKind === "statement" ? "Pernyataan: " : "Pertanyaan: "}
              {payload.lastQuestion}
            </p>
          ) : null}

          <div className="mt-3 flex-1 whitespace-pre-wrap text-sm leading-6">
            {payload?.answering && safeIndex === 0 && !current?.answer
              ? "Menyusun reaksi..."
              : current?.answer || payload?.answer || "Menunggu pertanyaan, pernyataan, atau analisis layar."}
          </div>

          {items.length > 1 ? (
            <div className="mt-2 flex items-center justify-between text-[11px] text-zinc-500">
              <button
                type="button"
                onClick={() => setIndex((value) => Math.min(items.length - 1, value + 1))}
                className="rounded border border-white/10 px-2 py-0.5"
              >
                ← lama
              </button>
              <span>
                {safeIndex + 1} / {items.length}
              </span>
              <button
                type="button"
                onClick={() => setIndex((value) => Math.max(0, value - 1))}
                className="rounded border border-white/10 px-2 py-0.5"
              >
                baru →
              </button>
            </div>
          ) : null}
        </>
      ) : (
        <div className="mt-3 flex-1 space-y-3 overflow-y-auto">
          {items.length === 0 ? (
            <p className="text-sm text-zinc-500">Belum ada riwayat.</p>
          ) : (
            items.map((item, itemIndex) => (
              <article key={item.id} className="rounded-lg border border-white/10 p-2.5">
                <p className="text-[11px] uppercase tracking-wide text-zinc-500">
                  {itemIndex === 0 ? "Terbaru · " : ""}
                  {entryKindLabel(item.cueKind, item.source)}
                </p>
                <p className="mt-1 text-xs text-zinc-400">{item.cue}</p>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6">
                  {item.answer || (itemIndex === 0 && payload?.answering ? "Menyusun reaksi..." : "—")}
                </p>
              </article>
            ))
          )}
        </div>
      )}

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => sendLiveCommand(sessionId, "answer")}
          className="rounded-lg border border-white/15 px-2.5 py-1 text-[11px] text-zinc-300"
        >
          Answer <span className="text-zinc-500">A</span>
        </button>
        <button
          type="button"
          onClick={() => sendLiveCommand(sessionId, "solve")}
          className="rounded-lg border border-white/15 px-2.5 py-1 text-[11px] text-zinc-300"
        >
          Layar <span className="text-zinc-500">⌘9</span>
        </button>
        <button
          type="button"
          onClick={() => sendLiveCommand(sessionId, "clear")}
          className="rounded-lg border border-white/15 px-2.5 py-1 text-[11px] text-zinc-300"
        >
          Clear <span className="text-zinc-500">C</span>
        </button>
      </div>

      <p className="mt-3 text-[11px] leading-4 text-zinc-500">
        Panah kiri/kanan atau [ ] untuk riwayat. ⌘9 = analisis tab yang sama dengan audio
        lawan. Bagikan tab meeting saja — overlay tidak masuk ke peserta lain.
      </p>
    </div>
  );
}
