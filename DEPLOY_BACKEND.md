# Hosting the AI backend

The AI features (`/explain`, `/followup`, `/chat`, `/models`) call `/api` on the
same origin as the site. How that path is served depends on the environment:

| Environment | What serves `/api` |
| --- | --- |
| `npm run dev` (local) | The Python FastAPI app on `http://localhost:8000`, via the Vite proxy in `vite.config.ts` |
| Netlify (production / previews) | The `chat` Netlify Function in `netlify/functions/chat.mjs` |

Keeping `/api` relative means no cross-origin requests, no CORS configuration and
no `VITE_CHAT_API_URL` pointing at a developer's `localhost` in a production
bundle — that misconfiguration was what produced "Failed to fetch" errors.

## Changing the AI system prompts

Edit the prompt files directly — they are the source of truth:

- Word / vocabulary assistant: `server/prompts/vocab.md`
- Grammar assistant: `server/prompts/grammar.md`
- Available models and labels: `server/models.json`

The Netlify Function cannot read those files at runtime, so `npm run build`
copies them into `netlify/functions/_lib/generated.mjs`. After any prompt edit,
regenerate and deploy in one step:

```bash
npm run sync:ai
```

(Or just tell me to sync — I can run it for you.)

## Local development

1. Start the Python backend from the repository root:

   ```bash
   uvicorn server.chat_api:app --host 0.0.0.0 --port 8000
   ```

   It reads keys from `.env.local` (copy `.env.example` and fill in the values).

2. Start the site: `npm run dev`. `/api/*` is proxied to port 8000.

## Netlify deployment

`npm run build` also regenerates `netlify/functions/_lib/generated.mjs` from
`server/prompts/*.md` and `server/models.json`, so the Function uses the same
prompts and model catalogue as the Python backend. The build command and the
functions directory are declared in `netlify.toml`.

Set these site environment variables (Netlify UI → Environment variables, or
`netlify env:set`):

| Variable | Scope | Purpose |
| --- | --- | --- |
| `SUPABASE_URL` | Functions | Verifies Supabase access tokens |
| `SUPABASE_SERVICE_ROLE_KEY` | Functions | Server-side Supabase key (secret) |
| `GEMINI_API_KEY` | Functions | Gemini models (secret) |
| `GROQ_API_KEY` | Functions | Groq models (secret) |
| `VITE_SUPABASE_URL` | Builds | Browser Supabase URL |
| `VITE_SUPABASE_ANON_KEY` | Builds | Browser publishable key |
| `VITE_CHAT_API_URL` | Builds | Set to `/api` (the default) |

Secrets must be set for a non-development context, e.g.:

```bash
netlify env:set GEMINI_API_KEY "..." --context production --secret
```

Add the secret to `deploy-preview` and `branch-deploy` too if previews should
have working AI. Do **not** pass `--scope` on a Free/Starter team — granular
scopes are a Pro feature and the CLI can report success without persisting the
variable. Verify with:

```bash
netlify env:list --site onestopdutch --context production --scope any
```

Then deploy:

```bash
npm run build
npx netlify deploy --prod --dir=dist --functions=netlify/functions
```

Note: `VITE_*` values are compiled into the bundle, so a rebuild is required
after changing them.

## Verify

- `GET /api/health` → JSON with `status: "ok"`, `supabase_configured: true`
  (false means the Supabase env vars did not reach the function) and the
  configured providers. `providers: []` means the provider keys are missing.
- `GET /api/models` (with a Supabase bearer token) → provider/model list.
- Open a note and click the AI button, or ask a question in the grammar chat.

If the whole site returns a Netlify login redirect, the project has Edge Access /
team login protection enabled (`sso_login` on the Netlify site). That is separate
from the AI backend; disable it in Netlify's access settings if the study site
should be public.

## Standalone Python backend (optional)

The original `server/chat_api.py` can still be deployed on Render, Railway or
Fly.io (see `Procfile` and `requirements.txt`) if you need a long-lived Python
service, e.g. for local Ollama embeddings / pgvector book retrieval. In that
case set `VITE_CHAT_API_URL` to its public URL and rebuild, and add the site
origin to `CHAT_ALLOWED_ORIGINS`. The Netlify Function does not run Ollama, so
grammar answers omit book excerpts (the Python backend also degrades this way
when Ollama is unavailable).
