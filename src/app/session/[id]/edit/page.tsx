"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { SessionForm } from "@/components/session-form";
import { getSession, saveSession } from "@/lib/storage";
import type { MeetingSession } from "@/lib/types";

export default function EditSessionPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [session, setSession] = useState<MeetingSession | null | undefined>(undefined);

  useEffect(() => {
    setSession(getSession(params.id));
  }, [params.id]);

  if (session === undefined) {
    return <div className="px-6 py-16 text-sm text-zinc-500">Memuat sesi...</div>;
  }

  if (!session) {
    return (
      <div className="mx-auto max-w-xl px-6 py-16 text-sm text-zinc-400">
        Sesi tidak ditemukan. <a href="/" className="text-teal-300">Kembali</a>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-10">
      <a href="/" className="text-sm text-zinc-400 hover:text-zinc-200">
        ← Dashboard
      </a>
      <h1 className="mt-4 text-2xl font-semibold">Edit knowledge</h1>
      <div className="mt-8">
        <SessionForm
          initial={session}
          submitLabel="Simpan knowledge"
          onSubmit={(next) => {
            saveSession(next);
            router.push(`/live/${next.id}`);
          }}
        />
      </div>
    </div>
  );
}
