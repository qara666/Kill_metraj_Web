# Quick Overview of Kill_metraj_Web

## What is this project?
A full‑stack web application for managing courier routes, orders and analytics. The backend is built with **Node.js/Express**, the frontend with **React + TypeScript**.

## Directory layout (high‑level)
```
Kill_metraj_Web/
├─ backend/          # Node.js server, API, services, models
├─ frontend/         # React app, components, pages, services
├─ docs/             # Project documentation (this folder)
├─ scripts/          # Helper scripts (dev start, import fix, etc.)
├─ config/           # Configuration files (env, DB, etc.)
├─ temp/             # Temporary files generated at runtime
└─ test-data/       # Sample data for local testing
```

## Getting started (dev)
1. **Install dependencies**
   ```bash
   npm install   # runs in the project root, installs both backend & frontend deps
   ```
2. **Run the development environment**
   ```bash
   ./scripts/start_local.sh   # starts backend + frontend with hot‑reload
   ```
   *Alternatively* you can start them separately:
   - `npm run dev:backend` – starts the Express server (`backend/simple_server.js`).
   - `npm run dev:frontend` – starts the React dev server (`frontend`).
3. Open `http://localhost:3000` (or the port shown in the console) to view the UI.

## Key entry points
- **Backend**: `backend/simple_server.js` – main server file.
- **Frontend**: `frontend/src/index.tsx` – React entry point.
- **API contracts**: `backend/src/routes/*.js` and `frontend/src/services/*.ts`.

## Useful scripts
- `scripts/check_servers.sh` – health‑check for backend & frontend.
- `scripts/fix-imports.sh` – re‑writes imports after refactoring.
- `scripts/start_cloud_sync.sh` – starts cloud‑sync service.

## Where to look for what?
- **Components** – `frontend/src/components/` (shared, modals, maps, excel, …).
- **Business logic** – `backend/src/services/` (ExcelService, TelegramService, …).
- **Utilities** – `backend/src/utils/` and `frontend/src/utils/`.
- **API layer** – `frontend/src/services/api.ts` and `backend/src/routes/`.
- **State management** – React contexts under `frontend/src/contexts/`.

## Documentation
All detailed docs live in this folder:
- `PROJECT_STRUCTURE.md` – full tree description (already present).
- `TELEGRAM_INTEGRATION.md` – how Telegram bot interacts.
- `FASTOPERTOR_API_INTEGRATION.md` – API details.
- `LOGGING_AND_RATE_LIMITING.md` – logging strategy.
- `AUTOPLANNER_IMPROVEMENTS.md` – future roadmap.

---
*Keep this file as a quick reference when onboarding new developers.*
