// Ranks & UID: gives every user a stable beecord UID and shows a rank badge next to their name in chat
// and in these settings. Ranks come from the shared registry (data/ranks.json, distributed to everyone
// by the repo auto-updater). The owner assigns ranks/UIDs below, then pushes data/ranks.json to share them.
//
// Distribution: what everyone sees is the repo's data/ranks.json. The editor here saves a LOCAL draft
// (a preview on your own client only). To make assignments official for everyone, press "Copy ranks.json"
// and commit it to the repo as data/ranks.json — the auto-updater then hands it to every client.

const RANKS_DEFAULT = {
    owner: { label: "OWNER", color: "#f0888a", glow: true, priority: 100 },
    dev: { label: "DEV", color: "#f2a9bc", glow: true, priority: 95 },
    admin: { label: "ADMIN", color: "#e8c478", glow: true, priority: 90 },
    premium: { label: "PREMIUM", color: "#b69cf0", glow: true, priority: 60 },
    supporter: { label: "SUPPORTER", color: "#80d09c", glow: false, priority: 40 },
    member: { label: "MEMBER", color: "#9dbfea", glow: false, priority: 10 }
};
// stable, offline UID derived from the Discord id (FNV-1a -> 6 hex). Subscribers can get a custom one.
const ranksDeriveUid = id => {
    let x = 0x811c9dc5; const s = String(id || "");
    for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 0x01000193); }
    return "BC-" + (x >>> 0).toString(16).toUpperCase().padStart(8, "0").slice(0, 6);
};
// merged registry: shared (repo) + local draft (owner preview)
const ranksBuild = draft => {
    const dist = (typeof window !== "undefined" && window.__beecordRanks) || {};
    return {
        ranks: Object.assign({}, RANKS_DEFAULT, dist.ranks || {}, (draft && draft.ranks) || {}),
        users: Object.assign({}, dist.users || {}, (draft && draft.users) || {}),
        shared: dist.users || {}
    };
};

(window.beecord || window.blxstncord).definePlugin({
    id: "ranks",
    name: "Ranks & UID",
    description: "Gives every user a beecord UID and shows rank badges next to names (chat + settings). Owner panel assigns ranks/UIDs for subscribers.",
    author: "beecord",
    version: "1.0.0",
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
                if (el.__bcAuthor === aid && el.__bcShowUid === showUid) continue; // unchanged (handles node reuse)
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

        api.cleanup(() => {
            for (const b of document.querySelectorAll(".bc-rank-badge")) b.remove();
            for (const el of document.querySelectorAll('[class*="username_"]')) { el.__bcAuthor = undefined; el.__bcBadge = null; el.__bcShowUid = undefined; }
        });
        return true;
    },

    options(api) {
        const h = api.ui.h;
        const getDraft = () => { const d = api.settings.get("draft", {}) || {}; d.users = d.users || {}; return d; };
        const reg = ranksBuild(getDraft());

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

        const mgmt = h("div");
        const drawMgmt = () => {
            const d = getDraft();
            const current = ranksBuild(d);
            const rankSel = api.ui.select(tiers.map(([id, r]) => [id, r.label]), tiers[0] ? tiers[0][0] : "member", () => {});
            const idIn = api.ui.input("", () => {}, "Discord user ID"); idIn.style.width = "220px";
            const uidIn = api.ui.input("", () => {}, "Custom UID (optional)"); uidIn.style.width = "150px";
            const addBtn = h("button", { type: "button", class: "fc-btn", style: "height:30px" }, "Assign");
            addBtn.addEventListener("click", () => {
                const id = String(idIn.value || "").trim();
                if (!/^\d{15,22}$/.test(id)) { api.toast("Enter a valid Discord user ID", "#e8c478", 2200); return; }
                const dd = getDraft();
                dd.users[id] = Object.assign({ rank: rankSel.value }, uidIn.value.trim() ? { uid: uidIn.value.trim() } : {});
                api.settings.set("draft", dd); idIn.value = ""; uidIn.value = ""; drawMgmt();
            });

            const rows = Object.entries(current.users).filter(([, u]) => !u._hidden).map(([id, u]) => {
                const r = current.ranks[u.rank] || { label: u.rank || "?", color: "#949ba4" };
                const inDraft = !!(d.users && d.users[id]);
                const del = h("button", { type: "button", class: "fc-btn sec", style: "height:26px" }, inDraft ? "Remove" : "Hide");
                del.addEventListener("click", () => {
                    const dd = getDraft();
                    if (inDraft) delete dd.users[id]; else dd.users[id] = { rank: "member", _hidden: true };
                    api.settings.set("draft", dd); drawMgmt();
                });
                return h("div", { style: "display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid var(--ig-child-border,#161616)" },
                    chip(r.label, r.color, r.glow),
                    h("span", { style: "flex:1;min-width:0;font-family:var(--ig-font,monospace);font-size:12px;color:#dbdee1;overflow:hidden;text-overflow:ellipsis" }, id),
                    h("span", { style: "color:#949ba4;font-size:11px;white-space:nowrap" }, (u.uid || ranksDeriveUid(id)) + (inDraft ? "  · draft" : "  · shared")),
                    del);
            });

            const copyBtn = h("button", { type: "button", class: "fc-btn", style: "height:30px" }, "Copy ranks.json for the repo");
            copyBtn.addEventListener("click", async () => {
                const r = ranksBuild(getDraft());
                const out = { _comment: "beecord ranks registry — commit this as data/ranks.json and push to share it with everyone.", ranks: r.ranks, users: Object.fromEntries(Object.entries(r.users).filter(([, u]) => !u._hidden)) };
                try { await navigator.clipboard.writeText(JSON.stringify(out, null, 2)); copyBtn.textContent = "Copied ✓ — commit it as data/ranks.json"; setTimeout(() => { copyBtn.textContent = "Copy ranks.json for the repo"; }, 2800); } catch { api.toast("Couldn't copy", "#f23f43", 1800); }
            });

            mgmt.replaceChildren(
                api.ui.note("Assign a rank/UID to a Discord user ID. This is a LOCAL preview on your client. To make it official for everyone, press “Copy ranks.json” and commit it to the repo (data/ranks.json) — the auto-updater shares it with every client."),
                h("div", { style: "display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:8px 0 10px" }, idIn, rankSel, uidIn, addBtn),
                rows.length ? h("div", { style: "max-height:220px;overflow:auto" }, ...rows) : h("div", { style: "padding:10px;color:#949ba4;font-size:12px" }, "No assignments yet."),
                h("div", { style: "margin-top:10px" }, copyBtn));
        };
        drawMgmt();

        return [
            idCard,
            h("div", { style: "font-size:10.5px;font-weight:700;letter-spacing:.04em;color:var(--ig-accent,#9dbfea);text-transform:uppercase;margin-bottom:6px" }, "Rank tiers"),
            legend,
            api.ui.row("Show the UID on the badge too (not just the rank)", api.ui.toggle(api.settings.get("showUid", false), v => api.settings.set("showUid", v))),
            h("div", { style: "font-size:10.5px;font-weight:700;letter-spacing:.04em;color:var(--ig-accent,#9dbfea);text-transform:uppercase;margin:14px 0 6px" }, "Assign ranks & UIDs"),
            mgmt
        ];
    }
});
