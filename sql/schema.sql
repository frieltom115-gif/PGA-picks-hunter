-- PostgreSQL / Supabase schema. Keep raw odds immutable for later calibration analysis.
create table tournaments (
  tournament_id text primary key,
  name text not null,
  start_date date,
  end_date date,
  pga_event_id text,
  winner_player text
);

create table odds_snapshots (
  snapshot_id uuid primary key default gen_random_uuid(),
  tournament_id text not null references tournaments(tournament_id),
  captured_at timestamptz not null,
  provider text not null,
  unique (tournament_id, captured_at, provider)
);

create table odds_quotes (
  snapshot_id uuid not null references odds_snapshots(snapshot_id),
  bookmaker text not null,
  player text not null,
  market text not null check (market = 'tournament_winner'),
  american_odds integer not null check (american_odds <> 0),
  primary key (snapshot_id, bookmaker, player, market)
);

create table bets (
  bet_id uuid primary key default gen_random_uuid(),
  tournament_id text not null references tournaments(tournament_id),
  placed_at timestamptz not null,
  snapshot_id uuid references odds_snapshots(snapshot_id),
  player text not null,
  bookmaker text not null,
  american_odds integer not null,
  stake numeric(12,2) not null check (stake > 0),
  fair_probability numeric(10,8) not null,
  expected_value_per_dollar numeric(10,8) not null,
  result text not null default 'open' check (result in ('open','won','lost','void')),
  settled_at timestamptz
);

create view bet_performance as
select date_trunc('month', settled_at)::date as month,
       count(*) filter (where result in ('won','lost')) as bets_settled,
       sum(stake) filter (where result in ('won','lost')) as staked,
       sum(case when result = 'won' then stake * (case when american_odds > 0 then american_odds / 100.0 else 100.0 / abs(american_odds) end) when result = 'lost' then -stake else 0 end) as profit
from bets group by 1 order by 1;
