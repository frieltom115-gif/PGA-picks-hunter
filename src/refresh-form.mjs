import fs from "node:fs/promises";
import path from "node:path";
import { buildRecentForm } from "./form.js";

const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, i, values) => {
  if (value.startsWith("--")) pairs.push([value.slice(2), values[i + 1]]);
  return pairs;
}, []));
if (!args.input || !args.output) throw new Error("Usage: node src/refresh-form.mjs --input <slash-results.json> --output <form-report.json>");

const source = JSON.parse(await fs.readFile(args.input, "utf8"));
if (!Array.isArray(source.events)) throw new Error("Slash results input must contain an events array.");
const results = source.events.flatMap((event) => event.rows.map((row) => ({ ...row, eventId: event.eventId, tournament: event.tournament })));
const report = {
  generatedAt: new Date().toISOString(),
  source: source.source,
  methodology: "Results-only percentile score weighted by event recency (four-event half-life); not a win probability or strokes-gained estimate.",
  eventsUsed: source.events.map(({ eventId, tournament }) => ({ eventId, tournament })),
  form: buildRecentForm(results),
};
await fs.mkdir(path.dirname(args.output), { recursive: true });
await fs.writeFile(args.output, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ events: report.eventsUsed.length, players: report.form.length }));
