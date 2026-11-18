// Ranks & UID: gives every user a stable beecord UID and shows a rank badge next to their name in chat
// and in these settings. Ranks come from the shared registry (data/ranks.json, distributed to everyone
// by the repo auto-updater).
//
// ADMIN PANEL (owner only): press Ctrl+Shift+A, or use the button in these settings. It is unlocked only
// for the owner's own Discord account on the machine that claimed ownership, so other users never see it.
// Assignments are a LOCAL preview; press "Copy ranks.json" and commit it to the repo to share them.

const RANKS_DEFAULT = {
    owner: { label: "OWNER", color: "#f0888a", glow: true, priority: 100 },
    dev: { label: "DEV", color: "#f2a9bc", glow: true, priority: 95 },
    admin: { label: "ADMIN", color: "#e8c478", glow: true, priority: 90 },
    premium: { label: "PREMIUM", color: "#b69cf0", glow: true, priority: 60 },
    supporter: { label: "SUPPORTER", color: "#80d09c", glow: false, priority: 40 },
    member: { label: "MEMBER", color: "#9dbfea", glow: false, priority: 10 }
};
const ranksDeriveUid = id => {
    let x = 0x811c9dc5; const s = String(id || "");
    for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 0x01000193); }
    return "BC-" + (x >>> 0).toString(16).toUpperCase().padStart(8, "0").slice(0, 6);
};
const ranksBuild = draft => {
    const dist = (typeof window !== "undefined" && window.__beecordRanks) || {};
    return {
        ranks: Object.assign({}, RANKS_DEFAULT, dist.ranks || {}, (draft && draft.ranks) || {}),
        users: Object.assign({}, dist.users || {}, (draft && draft.users) || {})
    };
};
const ranksMyId = api => { try { const US = api.stores.get("UserStore"); const u = US && US.getCurrentUser && US.getCurrentUser(); return (u && u.id) || null; } catch { return null; } };
// Owner = your account is marked "owner" in the registry, OR you've claimed this machine as owner locally.
const ranksIsOwner = api => {
    const id = ranksMyId(api); if (!id) return false;
    const u = ranksBuild(api.settings.get("draft", {}) || {}).users[id];
    if (u && u.rank === "owner" && !u._hidden) return true;
    return api.settings.get("ownerId", null) === id;
};

let ranksAdminWrap = null;
function ranksOpenAdmin(api) {
    if (!ranksIsOwner(api)) { try { api.toast("Admin panel is locked to the owner", "#e8c478", 1800); } catch { } return; }
    const h = api.ui.h;
    const closeAdmin = () => { if (ranksAdminWrap) { ranksAdminWrap.remove(); ranksAdminWrap = null; } };
    closeAdmin();
    const getDraft = () => { const d = api.settings.get("draft", {}) || {}; d.users = d.users || {}; return d; };

    const mkBtn = (label, fn, sec) => { const b = h("button", { type: "button" }, label); b.style.cssText = "height:30px;padding:0 13px;border:0;border-radius:7px;cursor:pointer;font:700 11.5px var(--ig-font,monospace);white-space:nowrap;" + (sec ? "background:#181818;color:#aab1bd;box-shadow:inset 0 0 0 1px #262626" : "background:var(--ig-accent,#9dbfea);color:#0c1016"); b.addEventListener("click", fn); return b; };
    const chip = (label, color, glow) => { const c = h("span", { class: "bc-rank-badge" + (glow ? " bc-glow" : ""), style: "margin:0" }, label); c.style.setProperty("--rc", color || "#9dbfea"); return c; };

    const wrap = h("div", { id: "beecord-rank-admin" });
    wrap.style.cssText = "position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:100002;width:min(560px,94vw);max-height:84vh;display:flex;flex-direction:column;" +
        "padding:14px;border-radius:14px;background:var(--ig-popup,#141414);border:1px solid var(--ig-border,#202020);box-shadow:0 18px 60px rgba(0,0,0,.6);" +
        "font:500 13px var(--ig-font,ui-monospace,monospace);color:#dbdee1";
    const body = h("div", { style: "flex:1;min-height:0;overflow:auto;padding-right:2px" });
    wrap.append(
        h("div", { style: "display:flex;align-items:center;gap:8px;margin-bottom:12px" },
            h("i", { style: "width:7px;height:7px;border-radius:2px;background:var(--ig-accent,#9dbfea);box-shadow:0 0 8px var(--ig-accent,#9dbfea)" }),
            h("div", { style: "flex:1;font-size:15px;font-weight:800;color:#f2f3f5" }, "Ranks · Admin"),
            (() => { const b = h("button", { type: "button", title: "Close" }, "×"); b.style.cssText = "width:26px;height:26px;border:0;border-radius:7px;cursor:pointer;background:transparent;color:#949ba4;font:700 15px var(--ig-font,monospace)"; b.addEventListener("click", closeAdmin); return b; })()),
        body);

    const tiers = () => Object.entries(ranksBuild(getDraft()).ranks).sort((a, b) => (b[1].priority || 0) - (a[1].priority || 0));

    const draw = () => {
        const d = getDraft();
        const reg = ranksBuild(d);
        const t = tiers();
        const idIn = h("input", { placeholder: "Discord user ID" }); idIn.style.cssText = "flex:1;min-width:180px;height:32px;padding:0 10px;box-sizing:border-box;border-radius:8px;border:1px solid var(--ig-border,#202020);background:rgba(0,0,0,.25);color:#dbdee1;font:inherit;outline:none"; idIn.addEventListener("keydown", e => e.stopPropagation());
        const rankSel = h("select"); rankSel.style.cssText = "height:32px;padding:0 8px;border-radius:8px;border:1px solid var(--ig-border,#202020);background:var(--ig-input,#1b1b1b);color:inherit;font:inherit"; for (const [id, r] of t) { const o = h("option", { value: id }, r.label); rankSel.append(o); }
        const uidIn = h("input", { placeholder: "Custom UID (optional)" }); uidIn.style.cssText = "width:150px;height:32px;padding:0 10px;box-sizing:border-box;border-radius:8px;border:1px solid var(--ig-border,#202020);background:rgba(0,0,0,.25);color:#dbdee1;font:inherit;outline:none"; uidIn.addEventListener("keydown", e => e.stopPropagation());
        const addBtn = mkBtn("Assign", () => {
            const id = String(idIn.value || "").trim();
            if (!/^\d{15,22}$/.test(id)) { api.toast("Enter a valid Discord user ID", "#e8c478", 2200); return; }
            const dd = getDraft(); dd.users[id] = Object.assign({ rank: rankSel.value }, uidIn.value.trim() ? { uid: uidIn.value.trim() } : {}); api.settings.set("draft", dd); draw();
        });

        const rows = Object.entries(reg.users).filter(([, u]) => !u._hidden).map(([id, u]) => {
            const r = reg.ranks[u.rank] || { label: u.rank || "?", color: "#949ba4" };
            const inDraft = !!(d.users && d.users[id]);
            const del = mkBtn(inDraft ? "Remove" : "Hide", () => { const dd = getDraft(); if (inDraft) delete dd.users[id]; else dd.users[id] = { rank: "member", _hidden: true }; api.settings.set("draft", dd); draw(); }, true);
            del.style.height = "26px";
            return h("div", { style: "display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid var(--ig-child-border,#161616)" },
                chip(r.label, r.color, r.glow),
                h("span", { style: "flex:1;min-width:0;font-family:var(--ig-font,monospace);font-size:12px;color:#dbdee1;overflow:hidden;text-overflow:ellipsis" }, id),
                h("span", { style: "color:#949ba4;font-size:11px;white-space:nowrap" }, (u.uid || ranksDeriveUid(id)) + (inDraft ? "  · draft" : "  · shared")),
                del);
        });

        const copyBtn = mkBtn("Copy ranks.json for the repo", async () => {
            const r = ranksBuild(getDraft());
            const out = { _comment: "beecord ranks registry — commit this as data/ranks.json and push to share it.", ranks: r.ranks, users: Object.fromEntries(Object.entries(r.users).filter(([, u]) => !u._hidden)) };
            try { await navigator.clipboard.writeText(JSON.stringify(out, null, 2)); copyBtn.textContent = "Copied ✓ — commit as data/ranks.json"; setTimeout(() => { copyBtn.textContent = "Copy ranks.json for the repo"; }, 2800); } catch { api.toast("Couldn't copy", "#f23f43", 1800); }
        });

        const sub = (title) => h("div", { style: "font-size:10.5px;font-weight:700;letter-spacing:.04em;color:var(--ig-accent,#9dbfea);text-transform:uppercase;margin:4px 0 8px" }, title);
        body.replaceChildren(
            h("div", { style: "font-size:11.5px;color:#949ba4;margin-bottom:12px;line-height:1.5" }, "This panel is only visible to you (the owner) on this machine. Changes are a local preview — press “Copy ranks.json” and commit it to the repo to share ranks with everyone."),
            sub("Assign rank & UID"),
            h("div", { style: "display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:12px" }, idIn, rankSel, uidIn, addBtn),
            sub("Current assignments"),
            rows.length ? h("div", null, ...rows) : h("div", { style: "padding:10px;color:#949ba4;font-size:12px" }, "No assignments yet."),
            h("div", { style: "display:flex;gap:8px;margin-top:14px" }, copyBtn, mkBtn("Close", closeAdmin, true)));
    };
    draw();
    document.body.append(wrap);
    ranksAdminWrap = wrap;
}

(window.beecord || window.blxstncord).definePlugin({
    id: "ranks",
    name: "Ranks & UID",
    description: "Gives every user a beecord UID and shows rank badges next to names (chat + settings). Owner-only admin panel (Ctrl+Shift+A) to assign ranks/UIDs.",
    author: "beecord",
    version: "1.1.0",
    category: "Look",
    enabledByDefault: true,
    webpack: true,

    start(api) {
        const h = api.ui.h;
        let cache = { key: null, reg: null };
        const registry = () => {
            const draft = api.settings.get("draft", {}) || {};
            const key = JSON.stringify(draft);
            if (key === cache.key && cache.reg) return cache.reg;
            cache = { key, reg: ranksBuild(draft) };
            return cache.reg;
        };

        api.addStyle(
            ".bc-rank-badge{display:inline-flex;align-items:center;margin-left:6px;padding:0 6px;height:15px;border-radius:5px;vertical-align:middle;" +
            "font:800 9.5px/15px var(--ig-font,ui-monospace,monospace);letter-spacing:.04em;white-space:nowrap;position:relative;top:-1px;" +
            "color:var(--rc,#9dbfea);background:color-mix(in srgb,var(--rc,#9dbfea) 15%,transparent);" +
            "box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--rc,#9dbfea) 45%,transparent)}" +
            ".bc-rank-badge.bc-glow{box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--rc) 55%,transparent),0 0 7px color-mix(in srgb,var(--rc) 38%,transparent)}" +
            ".bc-rank-uid{opacity:.72;margin-left:4px;font-weight:600}");

        const MS = api.stores.get("MessageStore");
        const SELCH = api.stores.get("SelectedChannelStore");
        const authorId = el => {
            try {
                const row = el.closest && el.closest('[id^="chat-messages-"]');
                if (!row) return null;
                const m = /chat-messages-(?:(\d+)-)?(\d+)/.exec(row.id);
                if (!m) return null;
                const cid = m[1] || (SELCH && SELCH.getChannelId && SELCH.getChannelId());
                const msg = MS && MS.getMessage && MS.getMessage(cid, m[2]);
                return (msg && msg.author && msg.author.id) || null;
            } catch { return null; }
        };
        const makeBadge = (rank, u, aid) => {
            const uid = (u && u.uid) || ranksDeriveUid(aid);
            const b = h("span", { class: "bc-rank-badge" + (rank.glow ? " bc-glow" : ""), title: rank.label + " · UID " + uid }, rank.label || "");
            b.style.setProperty("--rc", rank.color || "#9dbfea");
            if (api.settings.get("showUid", false)) b.append(h("span", { class: "bc-rank-uid" }, uid));
            return b;
        };
        const scan = () => {
            const reg = registry();
            const showUid = api.settings.get("showUid", false);
            for (const el of document.querySelectorAll('[class*="username_"]')) {
                const aid = authorId(el);
                if (el.__bcAuthor === aid && el.__bcShowUid === showUid) continue;
                el.__bcAuthor = aid; el.__bcShowUid = showUid;
                if (el.__bcBadge && el.__bcBadge.parentNode) el.__bcBadge.remove();
                el.__bcBadge = null;
                if (!aid) continue;
                const u = reg.users[aid];
                const rank = u && u.rank && !u._hidden && reg.ranks[u.rank];
                if (!rank) continue;
                const badge = makeBadge(rank, u, aid);
                el.__bcBadge = badge;
                try { el.insertAdjacentElement("afterend", badge); } catch { }
            }
        };
        api.dom.observe(scan, { throttle: 400 });

        // owner-only admin panel hotkey (silently ignored for everyone else)
        api.on(window, "keydown", e => {
            if (e.ctrlKey && e.shiftKey && !e.altKey && e.key.toLowerCase() === "a") {
                if (!ranksIsOwner(api)) return;
                e.preventDefault(); e.stopPropagation();
                ranksAdminWrap ? (ranksAdminWrap.remove(), ranksAdminWrap = null) : ranksOpenAdmin(api);
            }
            if (ranksAdminWrap && e.key === "Escape" && !e.ctrlKey) { e.preventDefault(); ranksAdminWrap.remove(); ranksAdminWrap = null; }
        }, true);

        api.cleanup(() => {
            if (ranksAdminWrap) { ranksAdminWrap.remove(); ranksAdminWrap = null; }
            for (const b of document.querySelectorAll(".bc-rank-badge")) b.remove();
            for (const el of document.querySelectorAll('[class*="username_"]')) { el.__bcAuthor = undefined; el.__bcBadge = null; el.__bcShowUid = undefined; }
        });
        return true;
    },

    options(api) {
        const h = api.ui.h;
        const reg = ranksBuild(api.settings.get("draft", {}) || {});
        let me = null;
        try { const US = api.stores.get("UserStore"); me = US && US.getCurrentUser && US.getCurrentUser(); } catch { }
        const myId = me && me.id;
        const myAssign = myId && reg.users[myId];
        const myUid = (myAssign && myAssign.uid) || (myId ? ranksDeriveUid(myId) : "—");
        const myRank = myAssign && myAssign.rank && !myAssign._hidden && reg.ranks[myAssign.rank];

        const chip = (label, color, glow) => { const c = h("span", { class: "bc-rank-badge" + (glow ? " bc-glow" : ""), style: "margin:0" }, label); c.style.setProperty("--rc", color || "#9dbfea"); return c; };
        const field = (k, v) => h("div", { style: "display:flex;gap:10px;align-items:center;padding:3px 0" }, h("span", { style: "min-width:64px;color:#949ba4;font-size:11.5px" }, k), v);

        const idCard = h("div", { style: "padding:12px;border-radius:10px;background:rgba(255,255,255,.03);border:1px solid var(--ig-border,#202020);margin-bottom:12px" },
            h("div", { style: "font-size:10.5px;font-weight:700;letter-spacing:.04em;color:var(--ig-accent,#9dbfea);text-transform:uppercase;margin-bottom:8px" }, "Your beecord identity"),
            field("Name", h("b", { style: "color:#f2f3f5" }, me ? (me.globalName || me.username || "you") : "(Discord still loading)")),
            field("UID", h("b", { style: "color:#dbdee1;font-family:var(--ig-font,monospace)" }, String(myUid))),
            field("Rank", myRank ? chip(myRank.label, myRank.color, myRank.glow) : h("span", { style: "color:#6c7280;font-size:12px" }, "No rank assigned")));

        const tiers = Object.entries(reg.ranks).sort((a, b) => (b[1].priority || 0) - (a[1].priority || 0));
        const legend = h("div", { style: "display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px" }, ...tiers.map(([, r]) => chip(r.label, r.color, r.glow)));

        // owner controls
        const owner = ranksIsOwner(api);
        const anyOwner = Object.values(reg.users).some(u => u.rank === "owner" && !u._hidden) || !!api.settings.get("ownerId", null);
        const ownerBox = h("div", { style: "margin-top:6px" });
        if (owner) {
            const open = h("button", { type: "button", class: "fc-btn", style: "height:32px" }, "🔒  Open admin panel");
            open.addEventListener("click", () => ranksOpenAdmin(api));
            ownerBox.append(api.ui.note("You are the owner on this machine. The admin panel (also Ctrl+Shift+A) is only visible to you."), open);
        } else if (!anyOwner && myId) {
            const claim = h("button", { type: "button", class: "fc-btn", style: "height:32px" }, "Claim this computer as owner");
            claim.addEventListener("click", async () => {
                const ok = await api.ui.confirm("Claim ownership", "Make THIS computer + your current Discord account the beecord owner?\n\nThis unlocks the admin panel here only. To make yourself owner for everyone, open the admin panel and push ranks.json to the repo.", "Claim", "Cancel");
                if (!ok) return;
                api.settings.set("ownerId", myId);
                const d = api.settings.get("draft", {}) || {}; d.users = d.users || {}; d.users[myId] = { rank: "owner" }; api.settings.set("draft", d);
                api.toast("You are now the owner on this machine", "#80d09c", 2200);
                ranksOpenAdmin(api);
            });
            ownerBox.append(api.ui.note("First-time setup: claim this machine as the owner to unlock the admin panel (only you will have it)."), claim);
        } else {
            ownerBox.append(api.ui.note("Admin tools are locked to the owner."));
        }

        return [
            idCard,
            h("div", { style: "font-size:10.5px;font-weight:700;letter-spacing:.04em;color:var(--ig-accent,#9dbfea);text-transform:uppercase;margin-bottom:6px" }, "Rank tiers"),
            legend,
            api.ui.row("Show the UID on the badge too (not just the rank)", api.ui.toggle(api.settings.get("showUid", false), v => api.settings.set("showUid", v))),
            h("div", { style: "font-size:10.5px;font-weight:700;letter-spacing:.04em;color:var(--ig-accent,#9dbfea);text-transform:uppercase;margin:14px 0 6px" }, "Admin"),
            ownerBox
        ];
    }
});
