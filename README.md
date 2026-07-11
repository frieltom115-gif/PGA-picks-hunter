# PGA golf expected-value model

An auditable, GitHub-friendly baseline for tournament-winner betting. It records each odds-board snapshot, removes bookmaker margin, compares the consensus fair probability with the best price, recommends a capped fractional-Kelly stake, and retains settled bets for ROI and calibration analysis.

## What is included

- `src/model.js` — odds conversion, proportional de-vig, consensus probability, EV, and fractional-Kelly sizing.
- `data/` — normalized input contract plus a small illustrative fixture; it is not live market data.
- `sql/schema.sql` — persistent model for tournaments, immutable snapshots, quotes, bets, and monthly performance.
- `.github/workflows/refresh.yml` — four-hour scheduled job and manual trigger; it runs tests now and is ready for a provider adapter.

## Important data-source decision

The model supports every PGA Tour event **only if the selected odds provider supplies every event and the desired books**. The Odds API’s official golf page currently lists winner odds for the four men’s majors, so it is useful as an adapter example but does not meet the all-PGA-Tour requirement by itself. Choose a licensed provider that expressly covers PGA Tour tournament-winner markets and your legal jurisdiction, then write a small adapter that emits the contract below. Do not scrape sportsbooks in violation of their terms.

Provider references: https://the-odds-api.com/sports/golf-odds.html and https://the-odds-api.com/liveapi/guides/v4/

## Normalized odds contract

The refresh program accepts one tournament snapshot at a time:

```json
{
  "eventId": "2026-api-event-id",
  "tournament": "Tournament name",
  "snapshotAt": "2026-03-10T14:00:00Z",
  "quotes": [
    {"bookmaker":"DraftKings","market":"tournament_winner","player":"Player Name","americanOdds":1200}
  ]
}
```

Every bookmaker board must be as complete as practical. The proportional de-vig approach assumes that omissions are not systematic; do not compare an abbreviated board against a full board.

## Run locally

Requires Node 20+.

```bash
npm test
npm run refresh:fixture
```

The output is `data/latest-run.json`. For production, persist both the raw provider response and normalized snapshot in the `odds_snapshots` / `odds_quotes` tables, then write eligible recommendations into `bets` only after the price is actually placed.

## Recommended production flow

1. A scheduled action calls the licensed odds provider with a repository secret.
2. Adapter normalizes and stores snapshots; never overwrite historical odds.
3. Model calculates fair probability from de-vigged multi-book consensus.
4. Review eligible rows, confirm the current price, and manually place bets.
5. Record the exact placed price and stake, then settle after the tournament.
6. Use `bet_performance` for ROI and add probability-bucket calibration once a meaningful sample exists.

This is decision support, not a promise of profitability. Models should be validated on historical, out-of-sample snapshots before capital is committed.
