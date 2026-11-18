# beecord ranks server — free setup (Cloudflare Workers)

A tiny always-on API that stores ranks/UIDs centrally, so you can assign **unique UIDs in real time**
and only *you* (who knows the admin key) can write. Everyone else only reads. Free, no credit card.

## Why a server (vs the repo model)
| | Repo (`data/ranks.json`) | Server (this Worker) |
|---|---|---|
| Distribute a change | you push to GitHub | instant |
| Unique UID enforced | no | yes (server checks) |
| Only owner can assign | only by repo push access | yes, via secret admin key |
| Cost / upkeep | free | free, nothing to maintain |

## One-time setup (~10 minutes, all in the browser)

1. **Account** — sign up free at <https://dash.cloudflare.com> (no card needed).
2. **Create the Worker** — left sidebar → **Workers & Pages** → **Create** → **Create Worker** →
   name it e.g. `beecord-ranks` → **Deploy**. You now have a URL like
   `https://beecord-ranks.<your-subdomain>.workers.dev`. **Copy this URL.**
3. **Create the database (KV)** — **Workers & Pages** → **KV** → **Create a namespace** → call it `RANKS`.
4. **Connect KV to the Worker** — open your Worker → **Settings** → **Bindings** → **Add** →
   **KV namespace** → *Variable name:* `RANKS` → *Namespace:* the one you just made → **Save**.
5. **Set your admin key (secret)** — same **Settings** → **Variables and Secrets** → **Add** →
   type **Secret** → *Name:* `ADMIN_KEY` → *Value:* a long random password (e.g. 30+ random characters).
   **Keep this secret.** It is your "only I can assign" key. → **Save**.
6. **Paste the code** — open your Worker → **Edit code** → delete the sample → paste the whole of
   [`server/ranks-worker.js`](ranks-worker.js) → **Deploy**.
7. **Test it** — open `https://beecord-ranks.<your-subdomain>.workers.dev/ranks` in your browser.
   You should see JSON with the default rank tiers and empty `users`. ✅

## Try an assignment (optional, from any terminal)
```bash
curl -X POST https://beecord-ranks.<you>.workers.dev/assign \
  -H "Content-Type: application/json" \
  -d '{"adminKey":"YOUR_ADMIN_KEY","userId":"123456789012345678","rank":"premium","uid":"001"}'
```
A second user trying to take `uid":"001"` gets `409 uid already taken` — that's the uniqueness guard.

## How beecord uses it (done in the client — ask me to wire it up)
- **loader.js** fetches `GET /ranks` on startup + every few minutes (from Electron's main process, so
  Discord's page CSP doesn't block it) and injects it as `window.__beecordRanks`. Falls back to the
  bundled `data/ranks.json` when offline.
- **Admin panel (owner):** you paste the Worker URL + your `ADMIN_KEY` **once, locally** (stored only on
  your machine, never pushed). Assigning sends the request through the loader to `POST /assign`.
  The key never reaches other clients, so only you can assign — enforced by the server.

Security notes: the `ADMIN_KEY` lives only in Cloudflare (as a secret) and on your own machine (in
beecord's local settings). It is never in this repo and never sent to other users. Rotate it anytime by
changing the secret in Cloudflare and re-entering it in beecord.
