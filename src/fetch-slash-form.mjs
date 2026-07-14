import fs from "node:fs/promises";
import path from "node:path";

const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, i, values) => {
  if (value.startsWith("--")) pairs.push([value.slice(2), values[i + 1]]);
  return pairs;
}, []));
const apiKey = process.env.SLASH_GOLF_API_KEY;
if (!apiKey) throw new Error("SLASH_GOLF_API_KEY is required. Add it as an Actions secret; never commit it.");

const year = Number(args.year ?? new Date().getUTCFullYear());
const events = Number(args.events ?? 8);
const output = args.output ?? "data/slash-results.json";
const apiBase = "https://live-golf-data.p.rapidapi.com";
const headers = {
  "x-rapidapi-host": "live-golf-data.p.rapidapi.com",
  "x-rapidapi-key": apiKey,
};

async function request(endpoint, params) {
  const url = new URL(`${apiBase}/${endpoint}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`Slash Golf ${endpoint} failed (${response.status}): ${await response.text()}`);
  return response.json();
}

const scheduleResponse = await request("schedule", { year });
const schedule = scheduleResponse.schedule;
if (!Array.isArray(schedule)) throw new Error("Slash Golf schedule response did not contain a schedule array.");
const startOfSeason = Date.UTC(year, 0, 1);
const currentWeek = Number(args.week ?? Math.ceil((Date.now() - startOfSeason) / 604800000));
const candidates = schedule
  .filter((event) => Number(event?.date?.weekNumber) <= currentWeek)
  .slice(-events);

const resultEvents = [];
for (const event of candidates) {
  const leaderboard = await request("leaderboard", { tournId: event.tournId, year });
  if (leaderboard.roundStatus !== "Official" || !Array.isArray(leaderboard.leaderboardRows)) continue;
  const fieldSize = leaderboard.leaderboardRows.length;
  const rows = leaderboard.leaderboardRows
    .map((row) => ({
      player: [row.firstName, row.lastName].filter(Boolean).join(" "),
      position: Number.parseInt(String(row.position).replace(/\D/g, ""), 10),
      fieldSize,
    }))
    .filter((row) => row.player && Number.isInteger(row.position) && row.position > 0);
  resultEvents.push({
    eventId: String(event.tournId),
    tournament: event.name ?? `Tournament ${event.tournId}`,
    rows,
  });
}

const normalized = {
  source: "Slash Golf Live Golf Data API",
  generatedAt: new Date().toISOString(),
  year,
  events: resultEvents,
};
await fs.mkdir(path.dirname(output), { recursive: true });
await fs.writeFile(output, JSON.stringify(normalized, null, 2));
console.log(JSON.stringify({ year, officialEvents: resultEvents.length, rows: resultEvents.reduce((n, event) => n + event.rows.length, 0) }));
