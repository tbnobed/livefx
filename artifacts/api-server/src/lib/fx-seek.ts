export function seekBlockReason(frame: unknown, player: Record<string, unknown>): string | null {
  if (String(player.mode).toUpperCase() === "RECORD") return "Scrubbing is disabled while recording. Stop recording explicitly before seeking.";
  if (typeof player.mode !== "string" || !player.mode.trim()) return "Cannot verify the player state. Seek was not sent.";
  const length = typeof player.length === "number" || typeof player.length === "string" ? Number(player.length) : NaN;
  if (!Number.isInteger(length) || length < 1) return "The player has no valid timeline length. Seek was not sent.";
  if (typeof frame !== "number" || !Number.isInteger(frame) || frame < 0 || frame >= length) {
    return `Seek frame must be an integer from 0 to ${length - 1}. Reload the timeline and try again.`;
  }
  return null;
}
