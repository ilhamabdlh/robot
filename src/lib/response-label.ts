import type { CueKind, ResponseSource } from "./types";

export function entryKindLabel(cueKind: CueKind, source?: ResponseSource) {
  const base = cueKind === "statement" ? "Pernyataan" : "Pertanyaan";
  return source === "screen" ? `Layar · ${base}` : base;
}

export function entryCuePrefix(cueKind: CueKind, source?: ResponseSource) {
  if (source === "screen") {
    return cueKind === "statement" ? "Layar · pernyataan: " : "Layar · pertanyaan: ";
  }
  return cueKind === "statement" ? "Pernyataan: " : "Pertanyaan: ";
}
