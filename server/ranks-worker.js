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
//   GET  /banned?hwid=HASH      -> { banned }                                     (public, clients check it)
//   POST /hwid/ban   {adminKey,userId?|hwid?,reason?} -> ban a device             (owner only)
//   POST /hwid/unban {adminKey,userId?|hwid?}         -> unban a device           (owner only)
//   POST /hwid/list  {adminKey}                -> { bans:[{hwid,userId,reason,at}] } (owner only)
//   POST /rank    {adminKey,id,label?,color?,glow?,priority?,delete?} -> edit a tier (owner only)
//   GET  /state                 -> {motd?,poll?,giveaway?,countdown?,accent?}  (public, clients poll it)
//   POST /poll/vote     {userId,opt}      -> vote once in the current poll       (public)
//   POST /giveaway/join {userId}          -> enter the current giveaway once      (public)
//   POST /motd      {adminKey,text,emoji?,color?,link?} | {clear}                 (owner) sticky banner
//   POST /poll      {adminKey,q,opts[]} | {close} | {clear}                       (owner) live poll
//   POST /giveaway  {adminKey,prize} | {draw} | {clear}                           (owner) raffle + draw
//   POST /countdown {adminKey,label,target,color?,confetti?} | {clear}            (owner) live countdown
//   POST /accent    {adminKey,color} | {clear}                                    (owner) push UI accent
//   GET  /event                 -> current broadcast event or {}          (public, clients poll it)
//   POST /event   {adminKey,type,data?,ttl?,target?} -> broadcast an on-screen event (owner only)
//                 type: confetti|snow|fireworks|matrix|emoji|hearts|stars|flash|rainbow|invert|pulse|
//                       shake|announce|bigtext|marquee|image|toast|clear; data:{text,title,emoji,color,url,dur}

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
        // current broadcast event (confetti / announcement / …); clients poll this. Empty when none/expired.
        if (req.method === "GET" && url.pathname === "/event") {
            try { const s = await env.RANKS.get("event"); if (s) { const e = JSON.parse(s); if (!e.expires || Date.now() <= e.expires) return json(e); } } catch { }
            return json({});
        }
        // persistent owner-controlled state the client renders: message of the day, poll, giveaway,
        // countdown, pushed accent colour. Clients poll this and render whatever is present.
        if (req.method === "GET" && url.pathname === "/state") {
            const out = {};
            for (const k of ["motd", "poll", "giveaway", "countdown", "accent"]) {
                try { const s = await env.RANKS.get(k); if (s) out[k] = JSON.parse(s); } catch { }
            }
            return json(out);
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
            // optional HWID (hashed on the client): map userId<->hwid so the owner can ban a user's device.
            const hwid = String(body.hwid || "").toLowerCase();
            if (/^[a-f0-9]{16,64}$/.test(hwid)) {
                try { await env.RANKS.put("hw:" + id, hwid); } catch { }
                try { await env.RANKS.put("hu:" + hwid, id); } catch { }
                let banned = false; try { banned = (await env.RANKS.get("ban:" + hwid)) !== null; } catch { }
                return json({ ok: true, banned });
            }
            return json({ ok: true });
        }

        // ---- public HWID ban check: a client asks whether THIS machine is banned (no admin key) ----
        if (req.method === "GET" && url.pathname === "/banned") {
            const hwid = (url.searchParams.get("hwid") || "").toLowerCase();
            if (!/^[a-f0-9]{16,64}$/.test(hwid)) return json({ banned: false });
            let banned = false; try { banned = (await env.RANKS.get("ban:" + hwid)) !== null; } catch { }
            return json({ banned });
        }

        // ---- public interactions: vote in a poll / join a giveaway (no admin key; one per user) ----
        if (req.method === "POST" && url.pathname === "/poll/vote") {
            let b; try { b = await req.json(); } catch { return json({ error: "bad json" }, 400); }
            const uid = String(b.userId || ""); const opt = Number(b.opt);
            if (!/^\d{15,22}$/.test(uid)) return json({ error: "bad user" }, 400);
            const s = await env.RANKS.get("poll"); if (!s) return json({ error: "no poll" }, 404);
            const poll = JSON.parse(s);
            if (!poll.open) return json({ error: "closed" }, 409);
            if (!(opt >= 0 && opt < poll.opts.length)) return json({ error: "bad option" }, 400);
            const vk = "pvote:" + poll.id + ":" + uid;
            const prev = await env.RANKS.get(vk);
            if (prev === null) {
                poll.opts[opt].n = (poll.opts[opt].n || 0) + 1;
                await env.RANKS.put(vk, String(opt), { expirationTtl: 2592000 });
                await env.RANKS.put("poll", JSON.stringify(poll));
            }
            return json({ ok: true, poll });
        }
        if (req.method === "POST" && url.pathname === "/giveaway/join") {
            let b; try { b = await req.json(); } catch { return json({ error: "bad json" }, 400); }
            const uid = String(b.userId || "");
            if (!/^\d{15,22}$/.test(uid)) return json({ error: "bad user" }, 400);
            const s = await env.RANKS.get("giveaway"); if (!s) return json({ error: "none" }, 404);
            const g = JSON.parse(s);
            if (!g.open) return json({ error: "closed" }, 409);
            const jk = "gj:" + g.id + ":" + uid;
            const prev = await env.RANKS.get(jk);
            if (prev === null) { g.entries = (g.entries || 0) + 1; await env.RANKS.put(jk, "1", { expirationTtl: 604800 }); await env.RANKS.put("giveaway", JSON.stringify(g)); }
            return json({ ok: true, entries: g.entries || 0 });
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
            // ---- HWID bans (owner-only). Ban by Discord id (resolved to the device's hwid) or a raw hwid. ----
            if (url.pathname === "/hwid/ban") {
                let hwid = String(body.hwid || "").toLowerCase().trim();
                const userId = String(body.userId || "").trim();
                if (!hwid && /^\d{15,22}$/.test(userId)) { try { hwid = String((await env.RANKS.get("hw:" + userId)) || "").toLowerCase(); } catch { } }
                if (!/^[a-f0-9]{16,64}$/.test(hwid)) return json({ error: "no hwid — the user must have opened beecord at least once, or paste a raw HWID" }, 400);
                let who = userId; if (!who) { try { who = (await env.RANKS.get("hu:" + hwid)) || ""; } catch { } }
                const rec = { hwid, userId: who, reason: String(body.reason || "").slice(0, 200), at: Date.now() };
                await env.RANKS.put("ban:" + hwid, JSON.stringify(rec));
                return json({ ok: true, ban: rec });
            }
            if (url.pathname === "/hwid/unban") {
                let hwid = String(body.hwid || "").toLowerCase().trim();
                const userId = String(body.userId || "").trim();
                if (!hwid && /^\d{15,22}$/.test(userId)) { try { hwid = String((await env.RANKS.get("hw:" + userId)) || "").toLowerCase(); } catch { } }
                if (!/^[a-f0-9]{16,64}$/.test(hwid)) return json({ error: "no hwid to unban" }, 400);
                try { await env.RANKS.delete("ban:" + hwid); } catch { }
                return json({ ok: true, hwid });
            }
            if (url.pathname === "/hwid/list") {
                const out = [];
                try { let c; do { const l = await env.RANKS.list({ prefix: "ban:", cursor: c }); for (const k of (l.keys || [])) { try { const s = await env.RANKS.get(k.name); if (s) out.push(JSON.parse(s)); } catch { } } c = l.list_complete ? null : l.cursor; } while (c); } catch { }
                out.sort((a, b) => (b.at || 0) - (a.at || 0));
                return json({ bans: out });
            }
            if (url.pathname === "/motd") {
                if (body.clear) { try { await env.RANKS.delete("motd"); } catch { } return json({ ok: true, cleared: true }); }
                const text = String(body.text || "").slice(0, 300);
                if (!text) return json({ error: "empty" }, 400);
                const motd = { id: Date.now(), text, emoji: String(body.emoji || "").slice(0, 16), color: String(body.color || "").slice(0, 32), link: (/^https?:\/\//.test(body.link || "") ? String(body.link).slice(0, 300) : ""), at: Date.now() };
                await env.RANKS.put("motd", JSON.stringify(motd)); return json({ ok: true, motd });
            }
            if (url.pathname === "/poll") {
                if (body.clear) { try { await env.RANKS.delete("poll"); } catch { } return json({ ok: true, cleared: true }); }
                if (body.close) { const s = await env.RANKS.get("poll"); if (!s) return json({ error: "none" }, 404); const p = JSON.parse(s); p.open = false; await env.RANKS.put("poll", JSON.stringify(p)); return json({ ok: true, poll: p }); }
                const q = String(body.q || "").slice(0, 200);
                const opts = (Array.isArray(body.opts) ? body.opts : []).map(o => String(o).slice(0, 80)).filter(Boolean).slice(0, 6);
                if (!q || opts.length < 2) return json({ error: "need a question and 2+ options" }, 400);
                const poll = { id: Date.now(), q, opts: opts.map(t => ({ t, n: 0 })), at: Date.now(), open: true };
                await env.RANKS.put("poll", JSON.stringify(poll)); return json({ ok: true, poll });
            }
            if (url.pathname === "/giveaway") {
                if (body.clear) { try { await env.RANKS.delete("giveaway"); } catch { } return json({ ok: true, cleared: true }); }
                if (body.draw) {
                    const s = await env.RANKS.get("giveaway"); if (!s) return json({ error: "none" }, 404);
                    const g = JSON.parse(s); const entrants = [];
                    try { let c; do { const l = await env.RANKS.list({ prefix: "gj:" + g.id + ":", cursor: c }); for (const k of (l.keys || [])) entrants.push(k.name.split(":").pop()); c = l.list_complete ? null : l.cursor; } while (c); } catch { }
                    if (!entrants.length) return json({ error: "no entries" }, 400);
                    g.winner = entrants[Math.floor(Math.random() * entrants.length)]; g.open = false; g.drawnAt = Date.now();
                    await env.RANKS.put("giveaway", JSON.stringify(g)); return json({ ok: true, winner: g.winner, entries: entrants.length });
                }
                const prize = String(body.prize || "").slice(0, 120);
                if (!prize) return json({ error: "need a prize" }, 400);
                const g = { id: Date.now(), prize, at: Date.now(), open: true, entries: 0 };
                await env.RANKS.put("giveaway", JSON.stringify(g)); return json({ ok: true, giveaway: g });
            }
            if (url.pathname === "/countdown") {
                if (body.clear) { try { await env.RANKS.delete("countdown"); } catch { } return json({ ok: true, cleared: true }); }
                const target = Number(body.target);
                if (!isFinite(target) || target <= 0) return json({ error: "bad target" }, 400);
                const cd = { id: Date.now(), label: String(body.label || "").slice(0, 120), target, color: String(body.color || "").slice(0, 32), confetti: !!body.confetti };
                await env.RANKS.put("countdown", JSON.stringify(cd)); return json({ ok: true, countdown: cd });
            }
            if (url.pathname === "/accent") {
                if (body.clear) { try { await env.RANKS.delete("accent"); } catch { } return json({ ok: true, cleared: true }); }
                const color = String(body.color || "");
                if (!/^#?[0-9a-fA-F]{6}$/.test(color)) return json({ error: "bad color" }, 400);
                await env.RANKS.put("accent", JSON.stringify({ color: color.replace(/^#?/, "#"), at: Date.now() })); return json({ ok: true });
            }
            if (url.pathname === "/event") {
                const type = String(body.type || "").trim();
                const ALLOWED = ["confetti", "snow", "fireworks", "matrix", "emoji", "hearts", "stars", "flash", "rainbow", "invert", "pulse", "shake", "announce", "bigtext", "marquee", "image", "toast", "clear"];
                if (!ALLOWED.includes(type)) return json({ error: "unknown event type" }, 400);
                if (type === "clear") { try { await env.RANKS.delete("event"); } catch { } return json({ ok: true, cleared: true }); }
                const ttl = Math.min(600, Math.max(5, Number(body.ttl) || 45));   // seconds the event stays "fresh" for polling clients
                const src = (body.data && typeof body.data === "object") ? body.data : {};
                const data = {};
                if (typeof src.text === "string") data.text = src.text.slice(0, 500);
                if (typeof src.title === "string") data.title = src.title.slice(0, 120);
                if (typeof src.emoji === "string") data.emoji = src.emoji.slice(0, 40);
                if (typeof src.color === "string") data.color = src.color.slice(0, 32);
                if (typeof src.url === "string" && /^https:\/\//i.test(src.url)) data.url = src.url.slice(0, 500);
                if (src.dur != null) { const dn = Number(src.dur); if (isFinite(dn)) data.dur = Math.min(60, Math.max(1, dn)); }
                const target = (body.target && /^\d{15,22}$/.test(String(body.target))) ? String(body.target) : null;
                const event = { id: Date.now(), type, data, target, at: Date.now(), expires: Date.now() + ttl * 1000 };
                try { await env.RANKS.put("event", JSON.stringify(event), { expirationTtl: Math.max(60, ttl + 60) }); } catch { }
                return json({ ok: true, event });
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
