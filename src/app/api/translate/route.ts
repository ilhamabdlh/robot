import { getOpenAI } from "@/lib/openai";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { text?: string };
    const text = body?.text?.trim() || "";
    if (!text) {
      return Response.json({ translation: "" });
    }

    const openai = getOpenAI();
    const result = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.15,
      messages: [
        {
          role: "system",
          content: [
            "Translate to natural Bahasa Indonesia for someone in a live meeting who needs to catch what the interviewer said.",
            "Output only the Indonesian text. No preamble, no quotes, no notes.",
            "Keep names, tech terms, and numbers as-is when natural.",
            "If the input is already Indonesian, return it unchanged.",
          ].join(" "),
        },
        { role: "user", content: text },
      ],
    });

    const translation = result.choices[0]?.message?.content?.trim() || "";
    return Response.json({ translation });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gagal menerjemahkan";
    return Response.json({ error: message }, { status: 500 });
  }
}
