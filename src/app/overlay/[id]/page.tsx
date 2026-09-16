"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { OverlayView } from "@/components/overlay-view";
import { getSession } from "@/lib/storage";

export default function OverlayPage() {
  const params = useParams<{ id: string }>();
  const [title, setTitle] = useState("Robot overlay");

  useEffect(() => {
    const session = getSession(params.id);
    if (session) setTitle(session.title);
  }, [params.id]);

  return <OverlayView sessionId={params.id} title={title} />;
}
