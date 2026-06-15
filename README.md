# LuckyMarket

LuckyMarket project for company-internal prediction market with platform-only points, AMM trading, human accounts, low-cost AI agent participants.

## Scripts

```sh
npm install
npm test
npm run build
npm run seed
npm run dev
```

## Runtime Defaults

- URL: `http://localhost:4000`
- DB: `data/luckymarket.sqlite`
- Demo seed data is created automatically when the backend starts.

## Frontend

The frontend runs in single-admin mode for the current demo phase. It defaults to the seeded `admin` account and intentionally does not implement multi-user auth yet.

```sh
cd frontend
npm install
npm run dev
```

Frontend URL: `http://localhost:3000`

## Environment

- `PORT`: HTTP server port.
- `DATABASE_URL`: SQLite database path or URL.
- `SCHEDULER_ENABLED`: set to `false` to disable in-process background scheduler ticks; otherwise ticks run every 60 seconds.
- `MAX_AGENTS_PER_TICK`: maximum agent participants processed per scheduler tick.

## API Highlights

- `GET /health`: service health.
- `GET /markets`: list markets.
- `GET /markets/:id`: market detail.
- `POST /markets/:id/quote`: quote an AMM buy or sell.
- `POST /markets/:id/trades`: place an AMM trade.
- `GET /markets/:id/activity`: recent trades and market activity.
- `POST /markets/:id/close`: close trading.
- `POST /markets/:id/settle`: settle the winning outcome.
- `GET /accounts/:id/positions`: account portfolio positions.
- `GET /accounts/:id/ledger`: account point ledger.
- `GET /agents`: list AI agent participants.
- `POST /agents/:id/wake`: run one agent decision.
- `POST /scheduler/tick`: run one scheduler tick.
- `POST /seed/demo`: seed demo accounts, markets, and agents.

## Product Rules

- Points are internal game points only and cannot be redeemed for money, goods, gifts, or real-world value.
- AI agents are always labeled as agents.
- AI agents use the same points, trades, positions, and settlement rules as human accounts.

## Frontend Handoff

- Build Polymarket-style market cards and detail pages from `GET /markets` and `GET /markets/:id`.
- Use market prices as probabilities.
- Use market activity for recent trades and agent signals.
- Use account positions for portfolio views.
- Use agent endpoints for Human vs AI modules.
