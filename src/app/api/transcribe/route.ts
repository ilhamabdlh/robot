import { toFile } from "openai";
import { getOpenAI } from "@/lib/openai";

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    const language = String(form.get("language") || "id");

    if (!(file instanceof File) || file.size < 1000) {
      return Response.json({ text: "" });
    }

    const openai = getOpenAI();
    const buffer = Buffer.from(await file.arrayBuffer());
    const filename = file.name || "chunk.webm";
    const type = file.type || "audio/webm";
    const lang = language === "en" ? "en" : "id";

    const makeAudio = () => toFile(buffer, filename, { type });

    let result: { text: string };
    try {
      result = await openai.audio.transcriptions.create({
        file: await makeAudio(),
        model: "gpt-4o-mini-transcribe",
        language: lang,
      });
    } catch {
      result = await openai.audio.transcriptions.create({
        file: await makeAudio(),
        model: "whisper-1",
        language: lang,
      });
    }

    return Response.json({ text: result.text.trim() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Transkripsi gagal";
    return Response.json({ error: message }, { status: 500 });
  }
}
