# Migration Guide

## Goal

Move multiple Streamlit expedition-processing apps into a single product with:

- Railway-hosted Python backend
- Vercel-hosted frontend
- Shared landing page and per-tool workspaces

## Recommended migration pattern

For each Streamlit repository:

1. Identify pure processing code.
2. Move it into a function or class that accepts serializable input.
3. Keep file parsing, validation, and output shaping on the backend.
4. Rebuild the interaction layer in the frontend.

## Current source repos

The current migration set is:

- `model_agreement`: multi-file meteogram comparison
- `weather_app`: single-file weather figure and table
- `routing_figures`: routing polar plots and time series
- inline sail-usage script: routing heatmap plus sail crossover overlays

These have already been mapped into backend processors and frontend workspaces in this repository.

## Backend contract

Each tool should provide:

- metadata: slug, title, summary, status, tags
- input schema: fields the frontend can render
- processor: callable that accepts validated input and returns structured output

## Frontend contract

Each tool page should:

- fetch metadata and schema
- render form controls from schema
- submit requests to the backend
- show structured results and download links

## Suggested repo strategy

You currently have apps on GitHub. The cleanest approach is:

1. Keep this repository as the new platform shell.
2. Migrate one Streamlit app at a time into `backend/app/processors/`.
3. If an old repo contains reusable code, vendor only the processing modules you still want, not the Streamlit UI layer.

## Deployment split

- Deploy `backend/` to Railway as a Python service.
- Deploy `frontend/` to Vercel as a Next.js app.
- Set `NEXT_PUBLIC_API_BASE_URL` in Vercel to the Railway backend URL.

## Remaining migration gaps

The current platform already runs the three apps through FastAPI and Next.js, but there are still follow-up improvements worth doing:

- move large file handling to object storage instead of inline base64 responses
- add richer validation and user-facing error messages per tool
- add per-app result views if a generic workspace becomes too limiting
- add authentication if these tools should not stay public
