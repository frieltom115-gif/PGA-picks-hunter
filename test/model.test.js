import test from "node:test";
import assert from "node:assert/strict";
import { americanToDecimal, priceTournament, recommendBets, summarizeSettledBets } from "../src/model.js";
import snapshot from "../data/sample-odds.json" with { type: "json" };

test("converts American odds", () => {
  assert.equal(americanToDecimal(150), 2.5);
  assert.equal(americanToDecimal(-200), 1.5);
});

test("de-vigged consensus sums to one", () => {
  const probability = priceTournament(snapshot);
  const sum = [...probability.values()].reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - 1) < 1e-12);
});

test("recommendations select the best available price and apply stake cap", () => {
  const bets = recommendBets(snapshot, { bankroll: 1000, minEdge: -1, kellyFraction: 1, minBookmakers: 2 });
  const morikawa = bets.find((x) => x.player === "Collin Morikawa");
  assert.equal(morikawa.bookmaker, "Book B");
  assert.ok(morikawa.recommendedStake <= 50);
  assert.deepEqual(morikawa.qualityFlags, []);
});

test("outlier odds are flagged and not eligible", () => {
  const outlier = structuredClone(snapshot);
  outlier.quotes.push({ bookmaker: "Book C", market: "tournament_winner", player: "Collin Morikawa", americanOdds: 1100 });
  outlier.quotes = outlier.quotes.map((quote) => quote.player === "Collin Morikawa" && quote.bookmaker === "Book B"
    ? { ...quote, americanOdds: 100000 }
    : quote);
  const morikawa = recommendBets(outlier, { minEdge: -1 }).find((x) => x.player === "Collin Morikawa");
  assert.ok(morikawa.qualityFlags.includes("outlier_price"));
  assert.equal(morikawa.eligible, false);
});

test("settled bet performance returns ROI", () => {
  const result = summarizeSettledBets([{ stake: 10, americanOdds: 100, result: "won" }, { stake: 10, americanOdds: 100, result: "lost" }]);
  assert.equal(result.profit, 0);
  assert.equal(result.roi, 0);
});
