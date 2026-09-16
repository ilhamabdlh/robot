"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { deleteSession, listSessions } from "@/lib/storage";
import type { MeetingSession } from "@/lib/types";

export default function HomePage() {
  const [sessions, setSessions] = useState<MeetingSession[]>([]);
  const [hasKey, setHasKey] = useState<boolean | null>(null);

  function refresh() {
    setSessions(listSessions());
  }

  useEffect(() => {
    refresh();
    fetch("/api/health")
      .then((res) => res.json())
      .then((data) => setHasKey(Boolean(data.openai)))
      .catch(() => setHasKey(false));
  }, []);

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs tracking-[0.2em] text-teal-300/80 uppercase">Robot</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            Asisten meeting real-time
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-400">
            Siapkan knowledge pack, dengarkan meeting, lalu dapatkan jawaban cepat
            yang bisa Anda sampaikan sendiri. Overlay tetap di layar Anda — bukan
            mode siluman.
          </p>
        </div>
        <Link
          href="/session/new"
          className="rounded-xl bg-teal-400 px-4 py-2.5 text-sm font-semibold text-zinc-950 hover:bg-teal-300"
        >
          Buat sesi
        </Link>
      </div>

      {hasKey === false ? (
        <div className="mt-6 rounded-2xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-50">
          Belum ada API key. Buat file <code className="font-mono">.env.local</code> berisi
          <pre className="mt-2 rounded-lg bg-zinc-950/40 p-3 font-mono text-xs">
            OPENAI_API_KEY=sk-...
          </pre>
          lalu jalankan ulang <code className="font-mono">npm run dev</code>.
        </div>
      ) : null}

      <section className="mt-10">
        <h2 className="text-sm font-medium text-zinc-400">Sesi Anda</h2>
        {sessions.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-dashed border-white/15 px-6 py-12 text-center">
            <p className="text-zinc-300">Belum ada sesi.</p>
            <p className="mt-1 text-sm text-zinc-500">
              Buat sesi dan isi background, lawan bicara, serta agenda meeting.
            </p>
          </div>
        ) : (
          <ul className="mt-4 space-y-3">
            {sessions.map((item) => (
              <li
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-4"
              >
                <div>
                  <p className="font-medium">{item.title}</p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {item.language.toUpperCase()} · {item.model} ·{" "}
                    {new Date(item.updatedAt).toLocaleString("id-ID")}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 text-sm">
                  <Link
                    href={`/live/${item.id}`}
                    className="rounded-lg bg-teal-400 px-3 py-1.5 font-semibold text-zinc-950 hover:bg-teal-300"
                  >
                    Mulai
                  </Link>
                  <Link
                    href={`/session/${item.id}/edit`}
                    className="rounded-lg border border-white/15 px-3 py-1.5 hover:bg-white/5"
                  >
                    Knowledge
                  </Link>
                  <button
                    type="button"
                    onClick={() => {
                      deleteSession(item.id);
                      refresh();
                    }}
                    className="rounded-lg border border-white/15 px-3 py-1.5 text-zinc-400 hover:bg-white/5"
                  >
                    Hapus
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
