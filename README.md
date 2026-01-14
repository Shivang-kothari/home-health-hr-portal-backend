# home-health-hr-portal-backend

This repo runs a Node/Express backend and serves a minimal static frontend from `public/`.

## Quick start (MongoDB via Docker)

In one terminal:

```bash
docker compose up -d
cp .env.example .env
npm install
npm run dev
```

Then open:

- `http://localhost:5000/` (demo frontend)
- `http://localhost:5000/health` (health check)

Stop MongoDB when you’re done:

```bash
docker compose down
```

## Run backend with your own MongoDB (no Docker)

Start MongoDB on your machine, then:

```bash
cp .env.example .env
# edit .env and set MONGODB_URI to your Mongo connection string
npm install
npm run dev
```

