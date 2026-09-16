import { hasOpenAIKey } from "@/lib/openai";

export function GET() {
  return Response.json({ openai: hasOpenAIKey() });
}
