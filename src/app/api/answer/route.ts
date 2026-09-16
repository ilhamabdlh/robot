import type { CueKind, MeetingSession } from "@/lib/types";
import { getOpenAI } from "@/lib/openai";
import { buildAnswerMessages } from "@/lib/prompts";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      session: MeetingSession;
      question: string;
      userSpeech?: string;
      otherSpeech?: string;
      cueKind?: CueKind;
    };

    if (!body?.session || !body?.question?.trim()) {
      return Response.json({ error: "Belum ada ucapan lawan untuk direspon" }, { status: 400 });
    }

    const cueKind: CueKind = body.cueKind === "statement" ? "statement" : "question";
    const openai = getOpenAI();
    const stream = await openai.chat.completions.create({
      model: body.session.model || "gpt-4o-mini",
      temperature: cueKind === "statement" ? 0.75 : 0.55,
      stream: true,
      messages: buildAnswerMessages(body.session, body.question.trim(), {
        userSpeech: body.userSpeech?.trim() || "",
        otherSpeech: body.otherSpeech?.trim() || "",
        cueKind,
      }),
    });

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            const token = chunk.choices[0]?.delta?.content;
            if (token) controller.enqueue(encoder.encode(token));
          }
        } catch (error) {
          controller.error(error);
          return;
        }
        controller.close();
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gagal membuat jawaban";
    return Response.json({ error: message }, { status: 500 });
  }
}
