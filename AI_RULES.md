# AI_RULES.md

This document defines the **tech stack** and **library usage rules** for this repository. Use it as the source of truth when adding or changing features.

## Tech stack (high level)

- **Frontend:** React 18 + TypeScript, built with **Vite** (in `frontend/`).
- **Routing:** **react-router-dom v6** (routes are defined in `frontend/src/App.tsx`).
- **Styling:** **Tailwind CSS** (+ app theme variables in `frontend/src/styles/themes.css`).
- **Server state / caching:** **@tanstack/react-query**.
- **Client state:** **zustand** for global app state.
- **HTTP:** **axios** for API requests.
- **Real-time:** **socket.io-client** (frontend) + **socket.io** (backend).
- **Maps:** **mapbox-gl** (and related map utilities under `frontend/src/utils/maps/`).
- **Backend:** Node.js **Express** API (in `backend/`) with **Sequelize + Postgres**.

## Library rules (what to use for what)

### Frontend

1. **Routing**
   - Use `react-router-dom` for navigation and route definitions.
   - Add/modify routes only in `frontend/src/App.tsx`.

2. **Data fetching / server state**
   - Use **React Query** for anything that:
     - fetches data from the backend,
     - needs caching, refetching, retries, invalidation,
     - is shared across multiple screens.
   - Put React Query provider/config in `frontend/src/main.tsx` (already set up).

3. **HTTP client**
   - Use **axios** via the existing API service layer (see `frontend/src/services/api.ts`, `frontend/src/services/*`).
   - Do not call `fetch()` directly unless there is a strong reason (keep behavior consistent).

4. **Global client state**
   - Use **zustand** for cross-page UI/app state (filters, selections, feature toggles, calculation state, etc.).
   - Prefer React Query for server-derived data; do **not** duplicate server state into zustand.

5. **Forms**
   - Use **react-hook-form** for forms and validation flow.
   - Keep form components in `frontend/src/components/` and page wiring in `frontend/src/pages/`.

6. **UI components & icons**
   - Prefer existing shared components in `frontend/src/components/shared/` before creating new ones.
   - For accessible primitives already used in the project, use **@headlessui/react**.
   - Use **@heroicons/react** for icons (keep icon style consistent across the app).

7. **Styling**
   - Use **Tailwind CSS** for layout/spacing/typography.
   - Use theme variables from `themes.css` when choosing colors/backgrounds/borders (don’t hardcode new color systems).

8. **Charts & analytics UI**
   - Use **recharts** for charts/graphs.

9. **Maps**
   - Use **mapbox-gl** and the existing helpers under `frontend/src/utils/maps/`.
   - Centralize map token/loading logic in the existing loader utilities (don’t re-implement map initialization per component).

10. **Toasts / notifications**
   - Use **react-hot-toast** (already configured in `frontend/src/main.tsx`).

11. **Dates & times**
   - Use **date-fns** (avoid adding additional date libraries).

12. **Excel / file processing**
   - Use **xlsx** and the existing utilities in `frontend/src/utils/data/` and `frontend/src/components/excel/`.

### Backend

1. **Web framework**
   - Use **Express** for HTTP APIs.
   - Organize endpoints under `backend/src/routes/` and handlers under `backend/src/controllers/`.

2. **Database**
   - Use **Sequelize** with **Postgres** (`pg`) for persistence.
   - Keep model definitions in `backend/src/models/`.

3. **Validation**
   - Use **joi** for request validation (see existing validators in `backend/src/utils/validators/`).

4. **Auth & security**
   - Use **jsonwebtoken** for JWT auth and **bcryptjs** for password hashing.
   - Use existing middleware patterns (`backend/src/middleware/*`) for auth, rate limiting, and security.

5. **Logging & metrics**
   - Use **winston** / the existing logger utilities for structured logs.
   - Use existing middleware for metrics (`prom-client`) and request logging (`morgan`) where applicable.

6. **Real-time & integrations**
   - Use **socket.io** for real-time updates.
   - Use existing integration services (e.g., `backend/src/services/TelegramService.js`) rather than creating new ad-hoc clients.

## Project structure rules

- Frontend code lives in `frontend/src/`.
  - Pages: `frontend/src/pages/`
  - Components: `frontend/src/components/`
  - Shared UI: `frontend/src/components/shared/`
  - Hooks: `frontend/src/hooks/`
  - Services: `frontend/src/services/`
  - Utilities: `frontend/src/utils/`
- Backend code lives in `backend/src/`.

## Do / Don’t

- **Do** reuse existing services, hooks, and shared components before adding new patterns.
- **Do** keep server-state in React Query and client-state in zustand.
- **Don’t** introduce new major libraries (UI kits, state managers, date libs) without a compelling reason.
- **Don’t** bypass the established API/service layers (frontend services; backend controllers/routes).
