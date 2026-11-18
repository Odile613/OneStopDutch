# Hosting the AI backend

The React site is on Netlify, but the AI features (`/explain`, `/followup`,
`/chat`, `/models`) call a separate Python API. That API must run on a public
host, then the frontend must be rebuilt with its URL.

## 1. Deploy `server/chat_api.py`

The repo now has `requirements.txt` and a `Procfile`, so any Python host
(Render, Railway, Fly.io, etc.) can run:

```
uvicorn server.chat_api:app --host 0.0.0.0 --port $PORT
```

Run it **from the repository root** (the import is `server.chat_api`).

> This repo currently has no git remote. Render/Railway git deploys need one;
> Railway and Fly.io can also deploy from a local folder via their CLIs.

## 2. Set environment variables on the host

Copy the relevant values from `.env.local` (never commit it). The backend now
reads real environment variables first, so no `.env.local` file is needed on
the host.

Required:

| Variable | Purpose |
|---|---|
| `SUPABASE_URL` | Supabase project URL (auth verification + pgvector) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side key (never expose in the frontend) |
| `GEMINI_API_KEY` and/or `GROQ_API_KEY` | Model provider keys from `server/models.json` |
| `CHAT_ALLOWED_ORIGINS` | Comma-separated origins, e.g. `https://onestopdutch.netlify.app` |

Optional (book RAG for grammar explanations):

| Variable | Purpose |
|---|---|
| `OLLAMA_HOST` | Ollama base URL; defaults to `http://localhost:11434` |
| `OLLAMA_EMBED_MODEL` | Defaults to `nomic-embed-text` |

If Ollama/Supabase vectors are unavailable, `grammar_context()` logs a warning
and the AI answers from the system prompt alone (no book excerpts). Vocab and
the grammar chat are unaffected.

Check `GET /health` after deploying: it should list your configured providers.

## 3. Point the frontend at the backend

Set `VITE_CHAT_API_URL` to the public backend URL (no trailing slash):

- For CLI deploys, put it in `.env.local` and run `npm run build` again.
- For Netlify git builds, add it as a Netlify environment variable
  (Site configuration → Environment variables).

Then redeploy:

```
npm run build
npx netlify deploy --prod --dir=dist
```

`VITE_*` values are compiled into the bundle, so a rebuild is required —
changing the Netlify variable alone won't update an already-built `dist/`.

## 4. Verify

- `https://<your-backend>/health` → JSON with `status: ok` and providers.
- `https://onestopdutch.netlify.app` → open a note, click a brain icon / use
  the grammar chat; requests should now reach the backend.
