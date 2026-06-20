# LuckyMarket Frontend

React frontend for the LuckyMarket internal prediction-market demo.

## Current Mode

The app currently runs in single-admin mode:

- There is no login, registration, invite-code, or JWT flow in this phase.
- The frontend boots as the default `admin` account.
- On startup it calls `POST /seed/demo`, then loads `GET /accounts/handle/admin`.
- Admin can view markets, trade, inspect portfolio/ledger, wake AI agents, run scheduler ticks, create markets, close markets, and settle markets.
- Market detail pages show company event impact when a market has active event bindings and world events.

## Scripts

```sh
npm install
npm run dev
npm run build
npm run test -- --run
```

## Runtime

- Frontend dev URL: `http://localhost:3000`
- Backend API default: `http://localhost:4000`
- Optional override: `VITE_API_BASE_URL=http://localhost:4000`
- Company event impact uses `GET /markets/:id/world-events` and `GET /markets/:id/bindings`.

Start the backend from the repository root before opening the frontend:

```sh
npm run dev
```

Then start the frontend from this directory:

```sh
npm run dev
```
