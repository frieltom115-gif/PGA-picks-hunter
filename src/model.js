/** Core calculations. All odds snapshots are retained before recommendations are made. */
export function americanToDecimal(odds) {
  if (!Number.isFinite(odds) || odds === 0) throw new Error(`Invalid American odds: ${odds}`);
  return odds > 0 ? 1 + odds / 100 : 1 + 100 / Math.abs(odds);
}

export function impliedProbability(americanOdds) {
  return 1 / americanToDecimal(americanOdds);
}

/**
 * Removes each book's outright-market overround proportionally, then averages the
 * resulting probabilities and re-normalizes the consensus to 100%.
 */
export function priceTournament(snapshot) {
  const byBook = new Map();
  for (const quote of snapshot.quotes) {
    if (quote.market !== "tournament_winner") continue;
    const key = quote.bookmaker;
    if (!byBook.has(key)) byBook.set(key, []);
    byBook.get(key).push(quote);
  }
  if (byBook.size < 2) throw new Error("At least two complete bookmaker boards are required for a consensus price.");

  const consensus = new Map();
  const booksUsed = new Map();
  for (const quotes of byBook.values()) {
    const overround = quotes.reduce((sum, q) => sum + impliedProbability(q.americanOdds), 0);
    for (const q of quotes) {
      const fairAtBook = impliedProbability(q.americanOdds) / overround;
      consensus.set(q.player, (consensus.get(q.player) ?? 0) + fairAtBook);
      booksUsed.set(q.player, (booksUsed.get(q.player) ?? 0) + 1);
    }
  }
  const averaged = [...consensus.entries()].map(([player, probability]) => ({
    player,
    probability: probability / booksUsed.get(player),
  }));
  const normalization = averaged.reduce((sum, row) => sum + row.probability, 0);
  return new Map(averaged.map((row) => [row.player, row.probability / normalization]));
}

export function recommendBets(snapshot, {
  bankroll = 1000,
  minEdge = 0.02,
  kellyFraction = 0.25,
  minBookmakers = 3,
  maxBestPriceMultiple = 3,
} = {}) {
  const fairProbabilities = priceTournament(snapshot);
  const bestQuotes = new Map();
  const quotesByPlayer = new Map();
  for (const q of snapshot.quotes.filter((q) => q.market === "tournament_winner")) {
    const current = bestQuotes.get(q.player);
    if (!current || q.americanOdds > current.americanOdds) bestQuotes.set(q.player, q);
    if (!quotesByPlayer.has(q.player)) quotesByPlayer.set(q.player, []);
    quotesByPlayer.get(q.player).push(q);
  }
  return [...bestQuotes.values()]
    .map((quote) => {
      const fairProbability = fairProbabilities.get(quote.player);
      const decimalOdds = americanToDecimal(quote.americanOdds);
      const playerQuotes = quotesByPlayer.get(quote.player);
      const decimals = playerQuotes.map((q) => americanToDecimal(q.americanOdds)).sort((a, b) => a - b);
      const middle = Math.floor(decimals.length / 2);
      const medianDecimalOdds = decimals.length % 2 === 0
        ? (decimals[middle - 1] + decimals[middle]) / 2
        : decimals[middle];
      const priceOutlier = decimalOdds > medianDecimalOdds * maxBestPriceMultiple;
      const qualityFlags = [
        ...(playerQuotes.length < minBookmakers ? ["thin_market"] : []),
        ...(priceOutlier ? ["outlier_price"] : []),
      ];
      const b = decimalOdds - 1;
      const expectedValuePerDollar = fairProbability * b - (1 - fairProbability);
      const fullKelly = Math.max(0, expectedValuePerDollar / b);
      const stake = Math.min(bankroll * fullKelly * kellyFraction, bankroll * 0.05);
      return {
        eventId: snapshot.eventId,
        tournament: snapshot.tournament,
        snapshotAt: snapshot.snapshotAt,
        player: quote.player,
        bookmaker: quote.bookmaker,
        americanOdds: quote.americanOdds,
        fairProbability,
        impliedProbability: impliedProbability(quote.americanOdds),
        edge: fairProbability - impliedProbability(quote.americanOdds),
        expectedValuePerDollar,
        recommendedStake: stake,
        booksQuoted: playerQuotes.length,
        medianDecimalOdds,
        qualityFlags,
        eligible: expectedValuePerDollar >= minEdge && qualityFlags.length === 0,
      };
    })
    .sort((a, b) => b.expectedValuePerDollar - a.expectedValuePerDollar);
}

export function summarizeSettledBets(bets) {
  const settled = bets.filter((bet) => bet.result === "won" || bet.result === "lost");
  const staked = settled.reduce((sum, bet) => sum + bet.stake, 0);
  const profit = settled.reduce((sum, bet) => {
    const decimal = americanToDecimal(bet.americanOdds);
    return sum + (bet.result === "won" ? bet.stake * (decimal - 1) : -bet.stake);
  }, 0);
  return {
    betsSettled: settled.length,
    staked,
    profit,
    roi: staked === 0 ? null : profit / staked,
    winRate: settled.length === 0 ? null : settled.filter((bet) => bet.result === "won").length / settled.length,
  };
}
