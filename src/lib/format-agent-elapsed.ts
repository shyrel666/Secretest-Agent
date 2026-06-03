/** Claude Code 风格：短于 1 分钟显示小数秒，否则显示 m/s */
export function formatAgentElapsed(ms: number): string {
  const safe = Math.max(0, ms);
  if (safe < 60_000) {
    return `${(safe / 1000).toFixed(1)}s`;
  }
  const minutes = Math.floor(safe / 60_000);
  const seconds = Math.floor((safe % 60_000) / 1000);
  if (minutes < 60) {
    return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const remMin = minutes % 60;
  return remMin > 0 ? `${hours}h ${remMin}m` : `${hours}h`;
}
