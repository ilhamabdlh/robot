"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type {
  CueKind,
  LivePayload,
  MeetingSession,
  ResponseEntry,
  Speaker,
  TranscriptLine,
} from "@/lib/types";
import { classifyOtherTurn, shouldAutoRespond } from "@/lib/questions";
import { channelName, parseChannelMessage, writeLivePayload } from "@/lib/live-sync";
import { entryKindLabel } from "@/lib/response-label";
import { captureFrameFromVideo, ScreenCaptureError } from "@/lib/screen-capture";
import { shortcutAction } from "@/lib/shortcuts";
import {
  captureMicrophone,
  captureOtherAudio,
  microphoneErrorMessage,
  otherAudioHint,
  OtherAudioError,
  type OtherAudioCapture,
} from "@/lib/other-audio";

type PendingWork =
  | { type: "answer"; text: string; kind: CueKind }
  | { type: "solve" };

async function readTextStream(response: Response, onChunk: (full: string) => void) {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let full = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    full += decoder.decode(value, { stream: true });
    onChunk(full);
  }
  return full;
}

type Props = {
  session: MeetingSession;
};

function pickMimeType() {
  const types = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  return types.find((type) => MediaRecorder.isTypeSupported(type)) || "";
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function joinSpeech(lines: TranscriptLine[], speaker: Speaker, limit = 16) {
  return lines
    .filter((line) => line.speaker === speaker)
    .slice(-limit)
    .map((line) => line.text)
    .join("\n");
}

async function recordChunk(stream: MediaStream, ms: number) {
  const mimeType = pickMimeType();
  let recorder: MediaRecorder;
  try {
    recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  } catch {
    recorder = new MediaRecorder(stream);
  }
  const parts: Blob[] = [];

  const stopped = new Promise<void>((resolve) => {
    recorder.onstop = () => resolve();
  });

  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) parts.push(event.data);
  };

  recorder.start();
  await sleep(ms);
  if (recorder.state !== "inactive") recorder.stop();
  await stopped;
  return new Blob(parts, { type: recorder.mimeType || mimeType || "audio/webm" });
}

export function LiveConsole({ session }: Props) {
  const [lines, setLines] = useState<TranscriptLine[]>([]);
  const [listening, setListening] = useState(false);
  const [hasOtherAudio, setHasOtherAudio] = useState(false);
  const [autoAnswer, setAutoAnswer] = useState(session.autoAnswer);
  const [lastQuestion, setLastQuestion] = useState("");
  const [lastCueKind, setLastCueKind] = useState<CueKind | "">("");
  const [answer, setAnswer] = useState("");
  const [answering, setAnswering] = useState(false);
  const [error, setError] = useState("");
  const [hint, setHint] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [otherLevel, setOtherLevel] = useState(0);
  const [starting, setStarting] = useState(false);
  const [history, setHistory] = useState<ResponseEntry[]>([]);

  const listeningRef = useRef(false);
  const selfStreamRef = useRef<MediaStream | null>(null);
  const otherStreamRef = useRef<MediaStream | null>(null);
  const otherCaptureRef = useRef<OtherAudioCapture | null>(null);
  const otherVideoRef = useRef<HTMLVideoElement | null>(null);
  const otherSilentSinceRef = useRef<number | null>(null);
  const lastAnsweredRef = useRef("");
  const lastFiredAtRef = useRef(0);
  const lastQuestionRef = useRef("");
  const lastCueKindRef = useRef<CueKind | "">("");
  const answerRef = useRef("");
  const startedAtRef = useRef(0);
  const linesRef = useRef<TranscriptLine[]>([]);
  const autoAnswerRef = useRef(autoAnswer);
  const answeringRef = useRef(false);
  const otherUtteranceRef = useRef({ text: "", at: 0 });
  const startingRef = useRef(false);
  const hasOtherAudioRef = useRef(false);
  const otherAnswerTimerRef = useRef<number | null>(null);
  const historyRef = useRef<ResponseEntry[]>([]);
  const pendingWorkRef = useRef<PendingWork | null>(null);
  const drainPendingRef = useRef<() => void>(() => undefined);
  const activeEntryIdRef = useRef<string | null>(null);

  useEffect(() => {
    linesRef.current = lines;
  }, [lines]);

  useEffect(() => {
    autoAnswerRef.current = autoAnswer;
  }, [autoAnswer]);

  useEffect(() => {
    hasOtherAudioRef.current = hasOtherAudio;
  }, [hasOtherAudio]);

  useEffect(() => {
    lastQuestionRef.current = lastQuestion;
  }, [lastQuestion]);

  useEffect(() => {
    lastCueKindRef.current = lastCueKind;
  }, [lastCueKind]);

  useEffect(() => {
    historyRef.current = history;
  }, [history]);

  useEffect(() => {
    fetch("/api/health")
      .then((res) => res.json())
      .then((data) => setHasKey(Boolean(data.openai)))
      .catch(() => setHasKey(false));

    if (typeof window !== "undefined" && !window.isSecureContext) {
      setError(
        "Mikrofon diblokir. Buka http://localhost:3000 di Chrome, jangan http://192.168.x.x.",
      );
    }

    if (starting && !startingRef.current && !listeningRef.current) {
      setStarting(false);
      setHint("");
    }
  }, []);

  const publish = useCallback(
    (partial: Partial<LivePayload>) => {
      writeLivePayload({
        sessionId: session.id,
        listening: listeningRef.current,
        lastQuestion,
        lastCueKind,
        answer: answerRef.current,
        answering,
        history: historyRef.current,
        updatedAt: Date.now(),
        ...partial,
      });
    },
    [answering, lastCueKind, lastQuestion, session.id],
  );

  useEffect(() => {
    publish({
      listening,
      lastQuestion,
      lastCueKind,
      answer,
      answering,
      history,
    });
  }, [answer, answering, history, lastCueKind, lastQuestion, listening, publish]);

  useEffect(() => {
    if (!listening) return;
    const timer = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAtRef.current) / 1000));
    }, 500);
    return () => window.clearInterval(timer);
  }, [listening]);

  const requestAnswer = useCallback(
    async (cue: string, cueKind: CueKind = "question") => {
      const trimmed = cue.trim();
      if (!trimmed) return;

      if (answeringRef.current) {
        pendingWorkRef.current = { type: "answer", text: trimmed, kind: cueKind };
        return;
      }

      answeringRef.current = true;
      setAnswering(true);
      setLastQuestion(trimmed);
      setLastCueKind(cueKind);
      lastQuestionRef.current = trimmed;
      lastCueKindRef.current = cueKind;
      setAnswer("");
      answerRef.current = "";
      setError("");
      lastAnsweredRef.current = trimmed;
      lastFiredAtRef.current = Date.now();

      const entryId = crypto.randomUUID();
      activeEntryIdRef.current = entryId;
      const draft: ResponseEntry = {
        id: entryId,
        at: Date.now(),
        cueKind,
        cue: trimmed,
        answer: "",
        source: "speech",
      };
      setHistory((prev) => [draft, ...prev.filter((item) => item.answer.trim()).slice(0, 29)]);

      try {
        const response = await fetch("/api/answer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            session,
            question: trimmed,
            cueKind,
            userSpeech: joinSpeech(linesRef.current, "self"),
            otherSpeech: joinSpeech(linesRef.current, "other"),
          }),
        });

        if (!response.ok || !response.body) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload.error || "Gagal membuat jawaban");
        }

        await readTextStream(response, (full) => {
          answerRef.current = full;
          setAnswer(full);
          setHistory((prev) =>
            prev.map((item) => (item.id === entryId ? { ...item, answer: full } : item)),
          );
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Gagal membuat jawaban");
      } finally {
        answeringRef.current = false;
        setAnswering(false);
        activeEntryIdRef.current = null;
        drainPendingRef.current();
      }
    },
    [session],
  );

  const clearAnswer = useCallback(() => {
    setAnswer("");
    answerRef.current = "";
    setError("");
    publish({ answer: "", answering: false });
  }, [publish]);

  const triggerAnswer = useCallback(() => {
    const cue = lastQuestionRef.current;
    if (!cue) {
      setError("Belum ada pertanyaan atau pernyataan dari lawan yang bisa direspon.");
      return;
    }
    void requestAnswer(cue, lastCueKindRef.current || "question");
  }, [requestAnswer]);

  const requestSolve = useCallback(async () => {
    if (answeringRef.current) {
      pendingWorkRef.current = { type: "solve" };
      setHint("Analisis layar mengantri setelah jawaban sekarang selesai.");
      return;
    }

    setError("");
    setHint("Mengambil layar dari tab yang sama dengan audio lawan...");

    let image: string;
    try {
      image = await captureFrameFromVideo(otherVideoRef.current);
    } catch (err) {
      if (err instanceof ScreenCaptureError && err.code === "DENIED") {
        setHint("Pemilihan layar dibatalkan.");
        return;
      }
      setError(err instanceof Error ? err.message : "Gagal mengambil layar");
      setHint(
        hasOtherAudioRef.current
          ? ""
          : "Analisis layar memakai tab yang sama dengan Hubungkan audio lawan. Hubungkan dulu, lalu tekan ⌘9.",
      );
      return;
    }

    const cue = lastQuestionRef.current.trim();
    const cueKind: CueKind = lastCueKindRef.current || "question";
    const historyCue = cue || "Konten di layar";

    answeringRef.current = true;
    setAnswering(true);
    setAnswer("");
    answerRef.current = "";
    lastFiredAtRef.current = Date.now();
    if (cue) lastAnsweredRef.current = cue;
    setHint("Menganalisis layar dan menyesuaikan dengan ucapan interviewer...");

    const entryId = crypto.randomUUID();
    activeEntryIdRef.current = entryId;
    const draft: ResponseEntry = {
      id: entryId,
      at: Date.now(),
      cueKind,
      cue: historyCue,
      answer: "",
      source: "screen",
    };
    setHistory((prev) => [draft, ...prev.filter((item) => item.answer.trim()).slice(0, 29)]);

    try {
      const response = await fetch("/api/solve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session,
          image,
          question: cue,
          cueKind,
          userSpeech: joinSpeech(linesRef.current, "self"),
          otherSpeech: joinSpeech(linesRef.current, "other"),
        }),
      });

      if (!response.ok || !response.body) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || "Gagal menganalisis layar");
      }

      await readTextStream(response, (full) => {
        answerRef.current = full;
        setAnswer(full);
        setHistory((prev) =>
          prev.map((item) => (item.id === entryId ? { ...item, answer: full } : item)),
        );
      });
      setHint("Jawaban layar siap. Sesuaikan dengan apa yang interviewer ucapkan sebelum Anda bicara.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menganalisis layar");
      setHint("");
    } finally {
      answeringRef.current = false;
      setAnswering(false);
      activeEntryIdRef.current = null;
      drainPendingRef.current();
    }
  }, [session]);

  useEffect(() => {
    drainPendingRef.current = () => {
      const queued = pendingWorkRef.current;
      pendingWorkRef.current = null;
      if (!queued) return;
      if (queued.type === "answer" && queued.text !== lastAnsweredRef.current) {
        void requestAnswer(queued.text, queued.kind);
      }
      if (queued.type === "solve") void requestSolve();
    };
  }, [requestAnswer, requestSolve]);

  const handleTranscript = useCallback(
    (text: string, speaker: Speaker) => {
      const clean = text.trim();
      if (!clean) return;

      let isQuestion = false;
      let isStatement = false;
      let questionText = clean;

      if (speaker === "other") {
        const now = Date.now();
        const prev = otherUtteranceRef.current;
        if (prev.text && now - prev.at < 4000) {
          questionText = `${prev.text} ${clean}`.replace(/\s+/g, " ").trim();
        }
        otherUtteranceRef.current = { text: questionText, at: now };

        const cue = classifyOtherTurn(questionText) ?? classifyOtherTurn(clean);
        isQuestion = cue?.kind === "question";
        isStatement = cue?.kind === "statement";
        if (cue) {
          setLastQuestion(cue.text);
          setLastCueKind(cue.kind);
          lastQuestionRef.current = cue.text;
          lastCueKindRef.current = cue.kind;
        }

        if (autoAnswerRef.current && cue) {
          if (otherAnswerTimerRef.current) window.clearTimeout(otherAnswerTimerRef.current);
          const wait = cue.kind === "statement" ? 2200 : 1800;
          otherAnswerTimerRef.current = window.setTimeout(() => {
            const latestText = lastQuestionRef.current;
            const latestKind = lastCueKindRef.current || "question";
            if (
              latestText &&
              shouldAutoRespond({
                cue: { kind: latestKind, text: latestText },
                lastAnswered: lastAnsweredRef.current,
                lastFiredAt: lastFiredAtRef.current,
              })
            ) {
              void requestAnswer(latestText, latestKind);
            }
          }, wait);
        }
      }

      const line: TranscriptLine = {
        id: crypto.randomUUID(),
        at: Date.now(),
        speaker,
        text: clean,
        isQuestion,
        isStatement,
      };

      setLines((prev) => [...prev, line].slice(-80));
    },
    [requestAnswer],
  );

  const stopOtherAudio = useCallback(() => {
    otherCaptureRef.current?.stop();
    otherCaptureRef.current = null;
    otherStreamRef.current = null;
    otherSilentSinceRef.current = null;
    setHasOtherAudio(false);
    setOtherLevel(0);
  }, []);

  const stopListening = useCallback(() => {
    if (otherAnswerTimerRef.current) {
      window.clearTimeout(otherAnswerTimerRef.current);
      otherAnswerTimerRef.current = null;
    }
    startingRef.current = false;
    listeningRef.current = false;
    setListening(false);
    setStarting(false);
    setHint("");
    selfStreamRef.current?.getTracks().forEach((track) => track.stop());
    selfStreamRef.current = null;
    stopOtherAudio();
  }, [stopOtherAudio]);

  const listenStream = useCallback(
    async (stream: MediaStream, speaker: Speaker, isLive?: () => boolean) => {
      const chunkMs = speaker === "other" ? 1600 : 1800;
      let inflight = 0;

      const transcribe = async (blob: Blob) => {
        const form = new FormData();
        form.append("file", blob, `${speaker}.webm`);
        form.append("language", session.language);

        try {
          const response = await fetch("/api/transcribe", {
            method: "POST",
            body: form,
          });
          const payload = await response.json();
          if (!response.ok) throw new Error(payload.error || "Transkripsi gagal");
          if (payload.text) handleTranscript(payload.text, speaker);
        } catch (chunkError) {
          setError(
            chunkError instanceof Error ? chunkError.message : "Transkripsi gagal",
          );
        } finally {
          inflight -= 1;
        }
      };

      while (listeningRef.current && stream.active && (!isLive || isLive())) {
        while (inflight >= 3 && listeningRef.current) {
          await sleep(40);
        }
        if (!listeningRef.current) break;

        let blob: Blob;
        try {
          blob = await recordChunk(stream, chunkMs);
        } catch (recordError) {
          setError(
            recordError instanceof Error
              ? recordError.message
              : "Gagal merekam audio. Refresh halaman lalu coba lagi.",
          );
          break;
        }
        if (!listeningRef.current) break;
        if (blob.size < 400) continue;

        inflight += 1;
        void transcribe(blob);
      }
    },
    [handleTranscript, session.language],
  );

  const connectOtherAudio = useCallback(async () => {
    const videoEl = otherVideoRef.current;
    if (!videoEl) {
      setError("Overlay video capture belum siap. Refresh halaman lalu coba lagi.");
      return;
    }

    setError("");
    setHint(
      "Pilih Chrome Tab Zoom/Meet — bukan jendela aplikasi — dan centang Share tab audio.",
    );

    try {
      stopOtherAudio();
      const capture = await captureOtherAudio(videoEl);
      if (!listeningRef.current) {
        capture.stop();
        return;
      }
      otherCaptureRef.current = capture;
      otherStreamRef.current = capture.recordStream;
      setHasOtherAudio(true);
      setHint("Audio lawan terhubung. Analisis layar (⌘9) memakai tab yang sama.");

      capture.displayStream.getAudioTracks()[0]?.addEventListener("ended", () => {
        stopOtherAudio();
        setHint("Audio lawan berhenti. Klik Hubungkan audio lawan, lalu share tab meeting lagi.");
      });

      void listenStream(
        capture.recordStream,
        "other",
        () => capture.displayStream.active,
      );
    } catch (error) {
      stopOtherAudio();
      if (error instanceof OtherAudioError) {
        setError(error.message);
        setHint(otherAudioHint(error.code));
        return;
      }
      setHint(otherAudioHint());
      setError(error instanceof Error ? error.message : "Gagal menghubungkan audio lawan");
    }
  }, [listenStream, stopOtherAudio]);

  const startListening = useCallback(async () => {
    if (listeningRef.current || startingRef.current) return;

    startingRef.current = true;
    setError("");
    setStarting(true);
    setHint(
      "Menunggu izin mikrofon. Cek popup, ikon gembok di address bar, atau System Settings → Microphone. Tombol merah membatalkan tunggu.",
    );

    try {
      const selfStream = await captureMicrophone();
      if (!startingRef.current) {
        selfStream.getTracks().forEach((track) => track.stop());
        setStarting(false);
        return;
      }

      selfStreamRef.current = selfStream;
      listeningRef.current = true;
      startedAtRef.current = Date.now();
      setElapsed(0);
      setListening(true);
      setStarting(false);
      startingRef.current = false;
      setHint("Mikrofon aktif. Klik Hubungkan audio lawan untuk mendengar interviewer.");

      selfStream.getAudioTracks()[0].addEventListener("ended", () => {
        stopListening();
      });

      void listenStream(selfStream, "self");
    } catch (err) {
      listeningRef.current = false;
      startingRef.current = false;
      setListening(false);
      setStarting(false);
      selfStreamRef.current?.getTracks().forEach((track) => track.stop());
      selfStreamRef.current = null;
      setHint("");
      setError(microphoneErrorMessage(err));
    }
  }, [listenStream, stopListening]);

  const stopListeningRef = useRef(stopListening);
  stopListeningRef.current = stopListening;

  useEffect(() => () => stopListeningRef.current(), []);

  useEffect(() => {
    if (!hasOtherAudio) return;
    const timer = window.setInterval(() => {
      const capture = otherCaptureRef.current;
      if (!capture) return;
      const level = capture.getLevel();
      setOtherLevel(level);
      const now = Date.now();
      if (level < 0.018) {
        if (otherSilentSinceRef.current == null) otherSilentSinceRef.current = now;
        else if (now - otherSilentSinceRef.current > 8000) {
          setHint(
            "Tab terhubung tapi audionya kosong. Centang Share tab audio, dan share tab meeting di browser — bukan jendela aplikasi Zoom/Meet.",
          );
        }
      } else if (otherSilentSinceRef.current != null) {
        otherSilentSinceRef.current = null;
        setHint("Audio lawan terhubung.");
      }
    }, 250);
    return () => window.clearInterval(timer);
  }, [hasOtherAudio]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const action = shortcutAction(event);
      if (!action) return;
      event.preventDefault();
      if (action === "answer") triggerAnswer();
      if (action === "solve") void requestSolve();
      if (action === "clear") clearAnswer();
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [clearAnswer, requestSolve, triggerAnswer]);

  useEffect(() => {
    const channel = new BroadcastChannel(channelName(session.id));
    channel.onmessage = (event) => {
      const message = parseChannelMessage(event.data);
      if (message?.kind !== "command") return;
      if (message.command === "answer") triggerAnswer();
      if (message.command === "solve") void requestSolve();
      if (message.command === "clear") clearAnswer();
    };
    return () => channel.close();
  }, [clearAnswer, requestSolve, session.id, triggerAnswer]);

  function openOverlay() {
    const width = 360;
    const height = 420;
    const left = Math.max(40, window.screen.availWidth - width - 24);
    const top = 48;
    const url = `/overlay/${session.id}`;
    window.open(
      url,
      "robot-overlay",
      `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=no`,
    );
  }

  const minutes = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const seconds = String(elapsed % 60).padStart(2, "0");

  return (
    <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
      <section className="relative rounded-2xl border border-white/10 bg-white/5 p-5">
        <video
          ref={otherVideoRef}
          className="pointer-events-none fixed -left-[400px] top-0 -z-10 h-[180px] w-[320px] opacity-[0.01]"
          muted
          playsInline
          autoPlay
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs tracking-wide text-teal-200/80 uppercase">Live</p>
            <h1 className="mt-1 text-xl font-semibold">{session.title}</h1>
          </div>
          <div className="flex flex-col items-end gap-1 text-sm">
            <div className="flex items-center gap-2">
              <span
                className={`size-2 rounded-full ${listening ? "bg-teal-400 animate-pulse" : "bg-zinc-600"}`}
              />
              <span className="tabular-nums text-zinc-300">
                {starting ? "Meminta izin" : listening ? "Listening" : "Idle"} · {minutes}:
                {seconds}
              </span>
            </div>
            {listening ? (
              <p className="text-xs text-zinc-500">
                Anda: mic · Lawan:{" "}
                {hasOtherAudio ? (
                  <span className="text-teal-300">
                    tab audio {otherLevel > 0.02 ? "●" : "○"}
                  </span>
                ) : (
                  "belum"
                )}
              </p>
            ) : null}
          </div>
        </div>

        {hasKey === false ? (
          <p className="mt-4 rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-sm text-amber-100">
            Tambahkan <code className="font-mono">OPENAI_API_KEY</code> di{" "}
            <code className="font-mono">.env</code> atau{" "}
            <code className="font-mono">.env.local</code> lalu restart server.
          </p>
        ) : null}

        <p className="mt-4 rounded-xl border border-white/10 bg-zinc-950/40 px-3 py-2 text-sm text-zinc-400">
          Lawan bicara hanya tertangkap dari <span className="text-zinc-200">audio tab Chrome</span>.
          Buka Zoom/Meet di browser, klik Hubungkan audio lawan, pilih tab itu, centang{" "}
          <span className="text-zinc-200">Share tab audio</span>.{" "}
          <span className="text-zinc-200">Analisis layar (⌘9)</span> mengambil gambar dari tab
          yang sama — tidak minta pilih layar lagi.
        </p>

        {hint ? (
          <p className="mt-4 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-300">
            {hint}
          </p>
        ) : null}

        {error ? (
          <p className="mt-4 rounded-xl border border-red-400/30 bg-red-400/10 px-3 py-2 text-sm text-red-100">
            {error}
          </p>
        ) : null}

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() =>
              listening || starting ? stopListening() : void startListening()
            }
            className={`rounded-xl px-4 py-2 text-sm font-semibold ${
              listening || starting
                ? "bg-red-400 text-zinc-950 hover:bg-red-300"
                : "bg-teal-400 text-zinc-950 hover:bg-teal-300"
            }`}
          >
            {starting ? "Batalkan tunggu" : listening ? "Stop" : "Mulai mendengar"}
          </button>
          {listening ? (
            <button
              type="button"
              onClick={() => void connectOtherAudio()}
              className="rounded-xl border border-teal-400/40 bg-teal-400/10 px-4 py-2 text-sm text-teal-100 hover:bg-teal-400/20"
            >
              {hasOtherAudio ? "Ganti audio lawan" : "Hubungkan audio lawan"}
            </button>
          ) : null}
          <button
            type="button"
            onClick={triggerAnswer}
            disabled={answering}
            title="Shortcut: A"
            className="rounded-xl border border-white/15 px-4 py-2 text-sm hover:bg-white/5 disabled:opacity-40"
          >
            {answering ? "Menulis..." : "Answer"}
            <span className="ml-2 text-[11px] text-zinc-500">A</span>
          </button>
          <button
            type="button"
            onClick={() => void requestSolve()}
            disabled={answering}
            title={
              hasOtherAudio
                ? "Shortcut: ⌘9 — analisis tab yang sama dengan audio lawan"
                : "Hubungkan audio lawan dulu. Analisis layar memakai tab itu."
            }
            className="rounded-xl border border-teal-400/30 bg-teal-400/10 px-4 py-2 text-sm text-teal-50 hover:bg-teal-400/20 disabled:opacity-40"
          >
            Analisis layar
            <span className="ml-2 text-[11px] text-teal-200/70">⌘9</span>
          </button>
          <button
            type="button"
            onClick={clearAnswer}
            title="Shortcut: C atau Esc"
            className="rounded-xl border border-white/15 px-4 py-2 text-sm hover:bg-white/5"
          >
            Clear
            <span className="ml-2 text-[11px] text-zinc-500">C</span>
          </button>
          <button
            type="button"
            onClick={openOverlay}
            className="rounded-xl bg-white/10 px-4 py-2 text-sm hover:bg-white/15"
          >
            Buka overlay
          </button>
          <Link
            href={`/session/${session.id}/edit`}
            className="rounded-xl border border-white/15 px-4 py-2 text-sm hover:bg-white/5"
          >
            Edit knowledge
          </Link>
        </div>

        <label className="mt-4 flex items-center gap-2 text-sm text-zinc-300">
          <input
            type="checkbox"
            checked={autoAnswer}
            onChange={(e) => setAutoAnswer(e.target.checked)}
            className="size-4 accent-teal-400"
          />
          Auto respon: pertanyaan dan pernyataan lawan (bukan basa-basi)
        </label>

        <div className="mt-5 h-[420px] overflow-y-auto rounded-xl bg-zinc-950/50 p-4 text-sm leading-6">
          {lines.length === 0 ? (
            <p className="text-zinc-500">
              Mikrofon = suara Anda (knowledge). Tab meeting = lawan. Analisis layar (⌘9)
              memakai tab yang sama setelah audio lawan terhubung.
            </p>
          ) : (
            lines.map((line) => (
              <p
                key={line.id}
                className={
                  line.speaker === "self"
                    ? "text-zinc-400"
                    : line.isQuestion
                      ? "text-teal-200"
                      : line.isStatement
                        ? "text-amber-200"
                        : "text-zinc-200"
                }
              >
                {line.speaker === "self"
                  ? "Anda · "
                  : line.isQuestion
                    ? "Lawan Q · "
                    : line.isStatement
                      ? "Lawan P · "
                      : "Lawan · "}
                {line.text}
              </p>
            ))
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-teal-400/20 bg-teal-400/5 p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-medium tracking-wide text-teal-200/80 uppercase">
            Riwayat reaksi & jawaban
          </h2>
          {answering ? (
            <span className="text-xs text-teal-200/80">streaming</span>
          ) : history.length > 0 ? (
            <span className="text-xs text-zinc-500">{history.length} entri</span>
          ) : null}
        </div>
        <div className="mt-4 max-h-[640px] space-y-3 overflow-y-auto pr-1">
          {history.length === 0 ? (
            <p className="text-sm text-zinc-500">
              Belum ada reaksi. Pertanyaan, pernyataan, dan analisis layar akan tersimpan di sini.
            </p>
          ) : (
            history.map((item, index) => (
              <article
                key={item.id}
                className={`rounded-xl border p-3 ${
                  index === 0
                    ? "border-teal-400/30 bg-zinc-950/40"
                    : "border-white/10 bg-zinc-950/25"
                }`}
              >
                <div className="flex items-center justify-between gap-2 text-[11px] uppercase tracking-wide">
                  <span
                    className={
                      item.source === "screen"
                        ? "text-sky-200/80"
                        : item.cueKind === "statement"
                          ? "text-amber-200/80"
                          : "text-teal-200/80"
                    }
                  >
                    {index === 0 && answering ? "Sedang disusun · " : ""}
                    {entryKindLabel(item.cueKind, item.source)}
                  </span>
                  <span className="tabular-nums text-zinc-500">
                    {new Date(item.at).toLocaleTimeString("id-ID", {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })}
                  </span>
                </div>
                <p className="mt-2 text-sm text-zinc-400">{item.cue}</p>
                <div className="mt-3 whitespace-pre-wrap text-[15px] leading-7 text-zinc-100">
                  {item.answer || (index === 0 && answering ? "Menyusun reaksi..." : "—")}
                </div>
              </article>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
