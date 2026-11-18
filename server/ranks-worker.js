// beecord ranks API — a Cloudflare Worker. Free, no credit card, globally fast, no server to maintain.
//
// It stores the rank registry in a KV namespace and lets ONLY the owner (who knows ADMIN_KEY) assign
// ranks + unique UIDs. Everyone else can only read. UID uniqueness is enforced server-side.
//
// SETUP (dashboard, ~10 min) — see server/SETUP.md for the click-by-click version:
//   1. dash.cloudflare.com -> Workers & Pages -> Create -> Worker -> name it (e.g. beecord-ranks) -> Deploy
//   2. Workers & Pages -> KV -> Create a namespace called RANKS
//   3. Your Worker -> Settings -> Bindings -> add a KV binding: variable name RANKS -> that namespace
//   4. Your Worker -> Settings -> Variables and Secrets -> add a SECRET named ADMIN_KEY (a long random password)
//   5. Your Worker -> Edit code -> paste THIS file -> Deploy
//   6. Test: open https://<your-worker>.workers.dev/ranks  -> should return JSON
//
// ENDPOINTS:
//   GET  /ranks                 -> { ranks, users }                 (public, read-only)
//   GET  /uid/check?uid=NAME     -> { uid, available }              (public)
//   POST /assign  {adminKey,userId,rank,uid?}  -> assigns (unique UID enforced)   (owner only)
//   POST /remove  {adminKey,userId}            -> removes                          (owner only)
//   POST /rank    {adminKey,id,label?,color?,glow?,priority?,delete?} -> edit a tier (owner only)

const DEFAULT = {
    ranks: {
        owner: { label: "OWNER", color: "#f0888a", glow: true, priority: 100 },
        dev: { label: "DEV", color: "#f2a9bc", glow: true, priority: 95 },
        admin: { label: "ADMIN", color: "#e8c478", glow: true, priority: 90 },
        premium: { label: "PREMIUM", color: "#b69cf0", glow: true, priority: 60 },
        supporter: { label: "SUPPORTER", color: "#80d09c", glow: false, priority: 40 },
        member: { label: "MEMBER", color: "#9dbfea", glow: false, priority: 10 }
    },
    users: {}
};

const CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json"
};
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: CORS });

async function load(env) {
    try { const s = await env.RANKS.get("registry"); if (s) return JSON.parse(s); } catch { }
    return JSON.parse(JSON.stringify(DEFAULT));
}
const save = (env, reg) => env.RANKS.put("registry", JSON.stringify(reg));
const uidTaken = (reg, uid, exceptId) =>
    Object.entries(reg.users).some(([id, u]) => id !== exceptId && String(u.uid || "").toLowerCase() === String(uid).toLowerCase());

export default {
    async fetch(req, env) {
        if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
        const url = new URL(req.url);
        const reg = await load(env);

        // ---- public reads ----
        if (req.method === "GET" && url.pathname === "/ranks") {
            // also return the set of active beecord users (self-registered via /seen, auto-expiring)
            let beecord = [];
            try { const l = await env.RANKS.list({ prefix: "p:" }); beecord = (l.keys || []).map(k => k.name.slice(2)); } catch { }
            return json(Object.assign({}, reg, { beecord }));
        }
        if (req.method === "GET" && url.pathname === "/uid/check") {
            const uid = (url.searchParams.get("uid") || "").trim();
            return json({ uid, available: !!uid && !uidTaken(reg, uid, null) });
        }

        // ---- presence: a beecord client registers its OWN user id + profile (no admin key; cosmetic). ----
        // p:<id> = recently-active set (14d, timestamp in metadata); a:<id> = ever-seen (permanent, "downloads");
        // u:<id> = {username, globalName, avatar} so the admin can show profiles instead of raw ids.
        if (req.method === "POST" && url.pathname === "/seen") {
            let body; try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }
            const id = String(body.userId || "").trim();
            if (!/^\d{15,22}$/.test(id)) return json({ error: "invalid userId" }, 400);
            try { await env.RANKS.put("p:" + id, "1", { expirationTtl: 1209600, metadata: { t: Date.now() } }); } catch { }
            try { await env.RANKS.put("a:" + id, "1"); } catch { }
            const prof = {};
            if (body.username) prof.username = String(body.username).slice(0, 40);
            if (body.globalName) prof.globalName = String(body.globalName).slice(0, 40);
            if (body.avatar) prof.avatar = String(body.avatar).slice(0, 64);
            if (Object.keys(prof).length) { try { await env.RANKS.put("u:" + id, JSON.stringify(prof)); } catch { } }
            return json({ ok: true });
        }

        // ---- owner-only writes ----
        if (req.method === "POST") {
            let body;
            try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }
            if (!env.ADMIN_KEY || body.adminKey !== env.ADMIN_KEY) return json({ error: "unauthorized" }, 401);

            if (url.pathname === "/stats") {
                let total = 0, active = 0, activeNow = 0; const cutoff = Date.now() - 15 * 60 * 1000;
                try { let c; do { const l = await env.RANKS.list({ prefix: "a:", cursor: c }); total += (l.keys || []).length; c = l.list_complete ? null : l.cursor; } while (c); } catch { }
                try { let c; do { const l = await env.RANKS.list({ prefix: "p:", cursor: c }); for (const k of (l.keys || [])) { active++; const t = k.metadata && k.metadata.t; if (t && t > cutoff) activeNow++; } c = l.list_complete ? null : l.cursor; } while (c); } catch { }
                return json({ total, active, activeNow });
            }
            if (url.pathname === "/profiles") {
                const ids = (Array.isArray(body.ids) ? body.ids : []).map(s => String(s).trim()).filter(s => /^\d{15,22}$/.test(s)).slice(0, 300);
                const out = {};
                await Promise.all(ids.map(async id => { try { const s = await env.RANKS.get("u:" + id); if (s) out[id] = JSON.parse(s); } catch { } }));
                return json(out);
            }

            if (url.pathname === "/assign") {
                const userId = String(body.userId || "").trim();
                if (!/^\d{15,22}$/.test(userId)) return json({ error: "invalid userId" }, 400);
                const rank = String(body.rank || "member");
                if (!reg.ranks[rank]) return json({ error: "unknown rank" }, 400);
                const uid = body.uid ? String(body.uid).trim() : null;
                if (uid && uidTaken(reg, uid, userId)) return json({ error: "uid already taken" }, 409);
                reg.users[userId] = Object.assign({ rank }, uid ? { uid } : {});
                await save(env, reg);
                return json({ ok: true, userId, entry: reg.users[userId] });
            }
            if (url.pathname === "/remove") {
                const userId = String(body.userId || "").trim();
                delete reg.users[userId];
                await save(env, reg);
                return json({ ok: true, userId });
            }
            if (url.pathname === "/rank") {
                const id = String(body.id || "").trim();
                if (!id) return json({ error: "missing rank id" }, 400);
                if (body.delete) delete reg.ranks[id];
                else reg.ranks[id] = { label: body.label || id.toUpperCase(), color: body.color || "#9dbfea", glow: !!body.glow, priority: Number(body.priority) || 10 };
                await save(env, reg);
                return json({ ok: true, ranks: reg.ranks });
            }
        }
        return json({ error: "not found" }, 404);
    }
};
