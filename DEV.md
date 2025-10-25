# Local and Render setup

## Local development

Backend (port 5001):

```bash
cd backend
node simple_server.js
```

Frontend (Vite, port 5173):

```bash
cd frontend
npm run dev
```

Notes:
- Frontend calls `/api` via Vite proxy to `http://localhost:5001`.
- Do NOT set `VITE_API_BASE_URL` locally (or leave it empty) so `/api` proxy is used.

## Render deployment

Frontend environment variables:

```
VITE_API_BASE_URL=https://<your-backend>.onrender.com/api
```

Backend CORS allowed origins should include your frontend Render URL and local dev:

```
http://localhost:5173
http://127.0.0.1:5173
https://kill-metraj-frontend.onrender.com
```

Health check:
- Backend: GET `/api/health` -> `{ "status": "healthy" }`






