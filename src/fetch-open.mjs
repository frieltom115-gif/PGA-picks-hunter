import fs from "node:fs/promises";
import path from "node:path";

const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, i, values) => {
  if (value.startsWith("--")) pairs.push([value.slice(2), values[i + 1]]);
  return pairs;
}, []));
const apiKey = process.env.ODDS_API_KEY;
if (!apiKey) throw new Error("ODDS_API_KEY is required. Set it as a GitHub Actions secret.");
if (!args.output) throw new Error("Usage: node src/fetch-open.mjs --output <normalized-odds.json>");

const endpoint = new URL("https://api.the-odds-api.com/v4/sports/golf_the_open_championship_winner/odds");
endpoint.search = new URLSearchParams({
  apiKey,
  regions: "us",
  markets: "outrights",
  oddsFormat: "american",
  dateFormat: "iso",
}).toString();

const response = await fetch(endpoint);
if (!response.ok) throw new Error(`Odds provider request failed: ${response.status} ${await response.text()}`);
const events = await response.json();
if (!Array.isArray(events) || events.length !== 1) throw new Error(`Expected one Open Championship event; received ${Array.isArray(events) ? events.length : "an invalid response"}.`);

const event = events[0];
// The provider currently returns American golf prices in cents (e.g. 35000 for +350).
// Normalize to conventional American odds before they enter the model.
const normalizeAmericanOdds = (price) => Math.abs(price) >= 10000 && price % 100 === 0 ? price / 100 : price;
const quotes = (event.bookmakers ?? []).flatMap((bookmaker) =>
  (bookmaker.markets ?? [])
    .filter((market) => market.key === "outrights")
    .flatMap((market) => (market.outcomes ?? [])
      .filter((outcome) => Number.isFinite(outcome.price) && outcome.price !== 0)
      .map((outcome) => ({
        bookmaker: bookmaker.title,
        market: "tournament_winner",
        player: outcome.name,
        americanOdds: normalizeAmericanOdds(outcome.price),
        sourcePrice: outcome.price,
      }))),
);
if (quotes.length === 0) throw new Error("The provider returned no Open Championship outright prices.");

const snapshot = {
  eventId: event.id,
  tournament: event.sport_title ?? "The Open Championship",
  commenceTime: event.commence_time,
  snapshotAt: new Date().toISOString(),
  provider: "The Odds API",
  quotes,
};
await fs.mkdir(path.dirname(args.output), { recursive: true });
await fs.writeFile(args.output, JSON.stringify(snapshot, null, 2));
console.log(JSON.stringify({ eventId: snapshot.eventId, tournament: snapshot.tournament, bookmakers: event.bookmakers?.length ?? 0, quotes: quotes.length }));
