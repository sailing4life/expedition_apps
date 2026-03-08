# Expedition Apps Platform

This repository is a monorepo for turning several Streamlit-based expedition marine tools into one web platform:

- `backend/`: FastAPI service intended for Railway
- `frontend/`: Next.js app intended for Vercel

The platform is designed around an app registry. Each migrated tool is exposed through a shared frontend shell and a consistent backend processor interface.

## Current apps

The active web platform exposes these app slugs:

- `model-agreement`
- `weather-app`
- `routing-figures`
- `sail-usage-overlay`

## Architecture

- Frontend lists available expedition tools and routes users into a dedicated workspace per app.
- Backend exposes app metadata, input schemas, upload-aware processing endpoints, and result payloads.
- Each migrated tool lives behind a consistent processor interface so the frontend does not care whether the underlying implementation came from Streamlit.

## Local development

### Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

## Migration strategy

1. Keep the original Streamlit repos as references until the new web flow is stable.
2. Move reusable parsing and plotting logic into `backend/app/processors/`.
3. Register each tool in `backend/app/services/app_registry.py`.
4. Point the frontend workspace UI at the registered tool schema and result payloads.

Detailed notes live in `docs/migration-guide.md`.

## Deployment quick start

1. Deploy `backend/` to Railway.
2. Deploy `frontend/` to Vercel (root directory `frontend`).
3. Set env vars:
   - Railway: `CORS_ORIGINS=https://expedition.jellelourens.nl,http://localhost:3000`
   - Vercel: `NEXT_PUBLIC_API_BASE_URL=https://api.expedition.jellelourens.nl`
4. Connect domains:
   - Frontend: `expedition.jellelourens.nl` (Vercel)
   - Backend: `api.expedition.jellelourens.nl` (Railway)
