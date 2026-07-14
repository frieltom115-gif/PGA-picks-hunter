/**
 * Results-only recent-form score. This is intentionally not a win probability:
 * Slash Golf supplies results and leaderboards, not strokes-gained measurements.
 */
export function rankToPercentile(position, fieldSize) {
  if (!Number.isInteger(position) || position < 1) return null;
  if (!Number.isInteger(fieldSize) || fieldSize < position) return null;
  return (fieldSize - position + 1) / fieldSize;
}

export function buildRecentForm(results, { lookbackEvents = 8, halfLifeEvents = 4 } = {}) {
  if (!Array.isArray(results)) throw new Error("Results must be an array.");
  const eventOrder = [...new Set(results.map((row) => row.eventId))];
  const recentEvents = eventOrder.slice(-lookbackEvents);
  const eventAge = new Map(recentEvents.map((eventId, index) => [eventId, recentEvents.length - 1 - index]));
  const players = new Map();

  for (const row of results) {
    if (!eventAge.has(row.eventId)) continue;
    const percentile = rankToPercentile(row.position, row.fieldSize);
    if (percentile === null) continue;
    const weight = 0.5 ** (eventAge.get(row.eventId) / halfLifeEvents);
    const current = players.get(row.player) ?? { player: row.player, weightedScore: 0, weight: 0, starts: 0, wins: 0, top10s: 0, latestEventId: row.eventId };
    current.weightedScore += percentile * weight;
    current.weight += weight;
    current.starts += 1;
    current.wins += row.position === 1 ? 1 : 0;
    current.top10s += row.position <= 10 ? 1 : 0;
    current.latestEventId = row.eventId;
    players.set(row.player, current);
  }

  return [...players.values()]
    .map((row) => ({
      ...row,
      formScore: row.weightedScore / row.weight,
      weightedScore: undefined,
      weight: undefined,
    }))
    .sort((a, b) => b.formScore - a.formScore || b.starts - a.starts || a.player.localeCompare(b.player));
}
