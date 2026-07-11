import fs from "node:fs/promises";
import path from "node:path";
import { recommendBets } from "./model.js";

const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, i, values) => {
  if (value.startsWith("--")) pairs.push([value.slice(2), values[i + 1]]);
  return pairs;
}, []));
if (!args.input || !args.output) throw new Error("Usage: node src/refresh.mjs --input <normalized-odds.json> --output <run.json>");

const snapshot = JSON.parse(await fs.readFile(args.input, "utf8"));
const recommendations = recommendBets(snapshot, { bankroll: 1000, minEdge: 0.02, kellyFraction: 0.25 });
const run = { generatedAt: new Date().toISOString(), snapshot, recommendations };
await fs.mkdir(path.dirname(args.output), { recursive: true });
await fs.writeFile(args.output, JSON.stringify(run, null, 2));
console.log(JSON.stringify({ eventId: snapshot.eventId, recommendations: recommendations.filter((x) => x.eligible).length }));
