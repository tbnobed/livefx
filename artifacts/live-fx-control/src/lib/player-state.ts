import type { ServerStatus } from '@workspace/api-client-react';

// Project-open and player-enter are separate operations in Assimilate.
// Fail closed when the player state cannot be read; never auto-enter a timeline.
export function playerBlockReason(status?: ServerStatus): string | null {
  if (!status || status.connection !== 'online') return 'Connect the server before using transport.';
  const module = String(status.application.module ?? '').trim().toLowerCase();
  if (module !== 'player') {
    return 'Enter a timeline first: open Projects, then choose Enter beside the timeline you want to play in Constructs. Opening a project alone does not enter the player.';
  }
  if (typeof status.playmode.mode !== 'string' || !status.playmode.mode.trim()) {
    return 'Player status is unavailable. Refresh the server status before using transport.';
  }
  return null;
}
