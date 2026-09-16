"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { LiveConsole } from "@/components/live-console";
import { getSession } from "@/lib/storage";
import type { MeetingSession } from "@/lib/types";

export default function LivePage() {
  const params = useParams<{ id: string }>();
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
    <div className="mx-auto w-full max-w-6xl px-6 py-8">
      <a href="/" className="text-sm text-zinc-400 hover:text-zinc-200">
        ← Dashboard
      </a>
      <div className="mt-6">
        <LiveConsole session={session} />
      </div>
    </div>
  );
}
