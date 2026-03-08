# Deployment Notes

## Backend on Railway

Service root in Railway:

- `backend/`

Start command:

```bash
uvicorn app.main:app --host 0.0.0.0 --port $PORT
```

Environment variables:

- `CORS_ORIGINS=https://expedition.jellelourens.nl,https://your-frontend-domain.vercel.app,http://localhost:3000`

## Frontend on Vercel

Project root in Vercel:

- `frontend/`

Environment variables:

- `NEXT_PUBLIC_API_BASE_URL=https://api.expedition.jellelourens.nl`

## Domain model

- Vercel hosts the web UI.
- Railway hosts the processing API.
- The frontend reads tool definitions from the backend, so new tools are registered once in the API and automatically appear in the site catalog.

## Recommended custom domain setup (Cloudflare)

Frontend:

- Add `expedition.jellelourens.nl` as a domain in Vercel.
- In Cloudflare, create a `CNAME` record:
  - Name: `expedition`
  - Target: value shown by Vercel (usually `cname.vercel-dns.com`)
  - Proxy: DNS only during validation, then optional to enable proxy.

Backend:

- Add `api.expedition.jellelourens.nl` as a custom domain in Railway.
- In Cloudflare, create a `CNAME` record:
  - Name: `api.expedition`
  - Target: your Railway service domain (`*.up.railway.app`)
  - Proxy: DNS only first, then optional.

After DNS is live:

1. Update Railway `CORS_ORIGINS` to include `https://expedition.jellelourens.nl`.
2. Update Vercel `NEXT_PUBLIC_API_BASE_URL` to `https://api.expedition.jellelourens.nl`.
3. Redeploy both services.

## Current app coverage

The deployed platform is set up to expose:

- `model-agreement`
- `weather-app`
- `routing-figures`
- `sail-usage-overlay`

All three currently execute on the backend and return figures or structured results to the frontend.
