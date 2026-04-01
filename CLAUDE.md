# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**짭스패닉 (GalsPanic)** — A mobile casual territory-capture web game. Players draw lines to capture area on a board while avoiding monsters, progressively revealing AI-generated anime character artwork. Features two content tiers (General/Sexy) and a complete 300-stage progression.

Stack: Vanilla JS (Web frontend) + Node.js Express (Backend) + Stability AI SD3 (Image generation)

## Commands

### Backend (Node.js server)

```bash
cd server

# Install dependencies
npm install

# Development (auto-reload)
npm run dev

# Production
npm start

# Pre-generate batch 0 images before launch
npm run pregenerate
```

### Environment Setup

Copy `server/.env.example` to `server/.env` and fill in:
```
STABILITY_API_KEY=sk-...
PORT=3000
IMAGE_BASE_URL=http://localhost:3000/images
IMAGE_DIR=./public/images
```

### Stability AI Prompt Testing

Open `stability_ai_tester.html` in a browser to test image generation prompts manually before running the full server.

## Architecture

### Backend (Node.js Express — `server/`)

Three-layer image pipeline:

1. **`server.js`** — Express API (port 3000)
   - `GET /api/image?stage={n}&rating={g|s}` — Query image URL (polls until ready)
   - `GET /api/batch/status?batchIndex={n}` — Batch generation progress
   - `POST /api/batch/trigger` — Trigger async batch generation
   - `POST /api/reward/generate` — Generate reward images from user keywords
   - `GET /images/*` — Static file serving

2. **`imageStore.js`** — JSON-based metadata store (`data/images.json`)
   - 10 batches × 30 stages = 300 total stages
   - Batch states: `pending → generating → ready`
   - Designed to be swapped for Firebase/MongoDB/Redis

3. **`batchGenerator.js`** — Stability AI SD3 integration
   - 12-prompt base pool (6 general + 6 sexy themes) rotated by stage number
   - Sexy tier adds a modifier string (`swimsuit or lingerie`)
   - Deterministic seeding by stage for reproducibility
   - 1-second delay between API calls (rate/cost control)
   - Hard-filtered prohibited keywords: nsfw, loli, child, teen, school uniform

### Web Frontend (`web/`)

Vanilla JS single-page application, mobile-first responsive design.

**Entry point:** `web/index.html` — single HTML file, all screens managed via JS

**Modules (`web/js/`):**
- `config.js` — Game constants (grid size 20×26, speeds, thresholds, difficulty scaling)
- `game.js` — Core game loop: player movement, line drawing, BFS flood-fill area capture
- `api.js` — `API` class wrapping all server endpoints
- `app.js` — Screen router and top-level state (boot → main → content-select → game → gallery)
- `storage.js` — localStorage persistence (stage, lives, rating, gallery unlocks)

**Scene flow:** Boot → Main → ContentSelect → Game → Gallery (all in one HTML, toggled by CSS class)

**Game grid:** 20 columns × 26 rows, rendered on `<canvas>`

### Key Design Decisions

- **No build step:** Pure ES modules (`type="module"`), works with a static file server or directly from `server/`
- **Image caching:** Browser `sessionStorage` for stage images; reward images stored in `localStorage`
- **Batch strategy:** Batch 0 (stages 1–30) pre-generated at launch; subsequent batches triggered when the player approaches them
- **API keys:** Server-side only, never exposed to the browser
- **Fallback:** Placeholder images rendered on canvas when server images are unavailable

## Current Development Phase

**Phase 0 — Validation**

Remaining Phase 0 tasks:
- Stability AI prompt quality testing (`stability_ai_tester.html`)
- Character art quality validation
- Go/No-Go decision document

Full product spec is in `PRD/` (documents). Start with `PRD/INDEX.md`.
