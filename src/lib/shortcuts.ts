export function isTypingField(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable
  );
}

export type ShortcutAction = "answer" | "clear" | "solve";

export function shortcutAction(event: KeyboardEvent): ShortcutAction | null {
  if (isTypingField(event.target)) return null;

  if (event.metaKey || event.ctrlKey) {
    if (event.key === "Enter") return "answer";
    if (event.key === "9") return "solve";
    return null;
  }

  if (event.altKey) return null;

  const key = event.key.toLowerCase();
  if (key === "a") return "answer";
  if (key === "c" || key === "escape") return "clear";
  return null;
}
