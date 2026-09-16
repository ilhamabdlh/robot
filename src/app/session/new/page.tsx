"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SessionForm } from "@/components/session-form";
import { createSessionDraft, saveSession } from "@/lib/storage";
import type { MeetingSession } from "@/lib/types";

export default function NewSessionPage() {
  const router = useRouter();
  const [draft, setDraft] = useState<MeetingSession | null>(null);

  useEffect(() => {
    setDraft(createSessionDraft());
  }, []);

  if (!draft) {
    return <div className="px-6 py-16 text-sm text-zinc-500">Menyiapkan form...</div>;
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-10">
      <a href="/" className="text-sm text-zinc-400 hover:text-zinc-200">
        ← Dashboard
      </a>
      <h1 className="mt-4 text-2xl font-semibold">Sesi baru</h1>
      <p className="mt-2 text-sm text-zinc-400">
        Knowledge pack dipakai sebagai konteks jawaban selama meeting.
      </p>
      <div className="mt-8">
        <SessionForm
          initial={draft}
          submitLabel="Simpan & mulai"
          onSubmit={(session) => {
            saveSession(session);
            router.push(`/live/${session.id}`);
          }}
        />
      </div>
    </div>
  );
}
