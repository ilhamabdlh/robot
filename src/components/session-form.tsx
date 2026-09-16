"use client";

import { useEffect, useState } from "react";
import type { MeetingSession } from "@/lib/types";

type Props = {
  initial: MeetingSession;
  submitLabel: string;
  onSubmit: (session: MeetingSession) => void;
};

export function SessionForm({ initial, submitLabel, onSubmit }: Props) {
  const [form, setForm] = useState(initial);

  useEffect(() => {
    setForm(initial);
  }, [initial]);

  function update<K extends keyof MeetingSession>(key: K, value: MeetingSession[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function onPickFile(file: File | null) {
    if (!file) return;
    const text = await file.text();
    update("knowledge", {
      ...form.knowledge,
      extra: [form.knowledge.extra, `\n\n--- ${file.name} ---\n${text}`]
        .join("")
        .trim(),
    });
  }

  return (
    <form
      className="space-y-8"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit({
          ...form,
          title: form.title.trim() || "Sesi meeting",
          updatedAt: new Date().toISOString(),
        });
      }}
    >
      <section className="rounded-2xl border border-white/10 bg-white/5 p-6">
        <h2 className="text-sm font-medium tracking-wide text-teal-200/80 uppercase">
          Sesi
        </h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="block md:col-span-2">
            <span className="mb-1.5 block text-sm text-zinc-400">Judul meeting</span>
            <input
              required
              value={form.title}
              onChange={(e) => update("title", e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-zinc-950/60 px-3 py-2.5 outline-none focus:border-teal-400/60"
              placeholder="Contoh: Discovery call PT Maju"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm text-zinc-400">Bahasa jawaban</span>
            <select
              value={form.language}
              onChange={(e) => update("language", e.target.value as MeetingSession["language"])}
              className="w-full rounded-xl border border-white/10 bg-zinc-950/60 px-3 py-2.5 outline-none focus:border-teal-400/60"
            >
              <option value="id">Bahasa Indonesia</option>
              <option value="en">English</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm text-zinc-400">Model OpenAI</span>
            <select
              value={form.model}
              onChange={(e) => update("model", e.target.value as MeetingSession["model"])}
              className="w-full rounded-xl border border-white/10 bg-zinc-950/60 px-3 py-2.5 outline-none focus:border-teal-400/60"
            >
              <option value="gpt-4o-mini">gpt-4o-mini (lebih cepat)</option>
              <option value="gpt-4o">gpt-4o (lebih dalam)</option>
            </select>
          </label>
          <label className="flex items-center gap-3 md:col-span-2">
            <input
              type="checkbox"
              checked={form.autoAnswer}
              onChange={(e) => update("autoAnswer", e.target.checked)}
              className="size-4 accent-teal-400"
            />
            <span className="text-sm text-zinc-300">
              Auto respon: pertanyaan dan pernyataan lawan (bukan omongan basa-basi)
            </span>
          </label>
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/5 p-6">
        <h2 className="text-sm font-medium tracking-wide text-teal-200/80 uppercase">
          Knowledge pack
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-zinc-400">
          Isi ini yang membuat jawaban cepat dan relevan. Semakin konkret (proyek, angka,
          produk, keberatan pelanggan), semakin berguna saat meeting.
        </p>
        <div className="mt-5 space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-sm text-zinc-400">
              Background Anda (peran, pengalaman, pencapaian)
            </span>
            <textarea
              rows={5}
              value={form.knowledge.userBackground}
              onChange={(e) =>
                update("knowledge", { ...form.knowledge, userBackground: e.target.value })
              }
              className="w-full rounded-xl border border-white/10 bg-zinc-950/60 px-3 py-2.5 outline-none focus:border-teal-400/60"
              placeholder="Contoh: Product manager 6 tahun, pernah memimpin pembayaran QRIS, metrik..."
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm text-zinc-400">
              Lawan bicara / interviewer (nama, peran, perusahaan, gaya)
            </span>
            <textarea
              rows={4}
              value={form.knowledge.interviewer}
              onChange={(e) =>
                update("knowledge", { ...form.knowledge, interviewer: e.target.value })
              }
              className="w-full rounded-xl border border-white/10 bg-zinc-950/60 px-3 py-2.5 outline-none focus:border-teal-400/60"
              placeholder="Contoh: Rina, Head of Ops di perusahaan logistik. Suka angka dan risiko."
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm text-zinc-400">
              Agenda & topik pembahasan
            </span>
            <textarea
              rows={4}
              value={form.knowledge.agenda}
              onChange={(e) =>
                update("knowledge", { ...form.knowledge, agenda: e.target.value })
              }
              className="w-full rounded-xl border border-white/10 bg-zinc-950/60 px-3 py-2.5 outline-none focus:border-teal-400/60"
              placeholder="Contoh: pricing, SLA, integrasi API, keberatan soal timeline..."
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm text-zinc-400">Catatan tambahan</span>
            <textarea
              rows={5}
              value={form.knowledge.extra}
              onChange={(e) =>
                update("knowledge", { ...form.knowledge, extra: e.target.value })
              }
              className="w-full rounded-xl border border-white/10 bg-zinc-950/60 px-3 py-2.5 outline-none focus:border-teal-400/60"
              placeholder="FAQ, objection handling, angka produk, hal yang tidak boleh dijanjikan..."
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm text-zinc-400">
              Lampirkan .txt atau .md (opsional)
            </span>
            <input
              type="file"
              accept=".txt,.md,.markdown"
              onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-zinc-400 file:mr-3 file:rounded-lg file:border-0 file:bg-teal-400/15 file:px-3 file:py-1.5 file:text-teal-200"
            />
          </label>
        </div>
      </section>

      <button
        type="submit"
        className="rounded-xl bg-teal-400 px-5 py-2.5 text-sm font-semibold text-zinc-950 hover:bg-teal-300"
      >
        {submitLabel}
      </button>
    </form>
  );
}
