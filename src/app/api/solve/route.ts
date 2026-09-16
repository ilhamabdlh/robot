import type { CueKind, MeetingSession } from "@/lib/types";
import { getOpenAI } from "@/lib/openai";
import { buildSolveSystemPrompt, buildSolveUserText } from "@/lib/prompts";

const MAX_IMAGE_CHARS = 2_500_000;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      session: MeetingSession;
      image: string;
      question?: string;
      userSpeech?: string;
      otherSpeech?: string;
      cueKind?: CueKind;
    };

    const image = body?.image?.trim() || "";
    if (!body?.session || !image.startsWith("data:image/")) {
      return Response.json({ error: "Screenshot layar belum ada" }, { status: 400 });
    }
    if (image.length > MAX_IMAGE_CHARS) {
      return Response.json(
        { error: "Gambar layar terlalu besar. Crop dulu atau pilih jendela yang lebih kecil." },
        { status: 413 },
      );
    }

    const cue = body.question?.trim() || "";
    const cueKind: CueKind = body.cueKind === "statement" ? "statement" : "question";
    const openai = getOpenAI();
    const stream = await openai.chat.completions.create({
      model: body.session.model || "gpt-4o-mini",
      temperature: cueKind === "statement" ? 0.65 : 0.35,
      stream: true,
      messages: [
        {
          role: "system",
          content: buildSolveSystemPrompt(body.session, cueKind, Boolean(cue)),
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: buildSolveUserText(cue, {
                userSpeech: body.userSpeech?.trim() || "",
                otherSpeech: body.otherSpeech?.trim() || "",
                cueKind,
              }),
            },
            {
              type: "image_url",
              image_url: { url: image, detail: "high" },
            },
          ],
        },
      ],
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
    const message = error instanceof Error ? error.message : "Gagal menganalisis layar";
    return Response.json({ error: message }, { status: 500 });
  }
}
