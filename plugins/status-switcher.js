// Status Switcher: flip your presence (online / idle / do not disturb / invisible) from a quick picker
// (Ctrl+Shift+S) without opening the user menu. Optional auto-invisible on startup for a private login.
// Self-only: it just sets YOUR own Discord status, the same thing the account menu does.
(window.beecord || window.blxstncord).definePlugin({
    id: "status-switcher",
    name: "Status Switcher",
    description: "Quickly change your status (online/idle/dnd/invisible) with Ctrl+Shift+S. Optional auto-invisible when Discord starts.",
    author: "beecord",
    version: "1.0.0",
    category: "Privacy & Safety",
    enabledByDefault: false,
    webpack: true,

    start(api) {
        const h = api.ui.h;
        const STATUSES = [
            { id: "online", label: "Online", color: "#23a55a" },
            { id: "idle", label: "Idle", color: "#f0b232" },
            { id: "dnd", label: "Do Not Disturb", color: "#f23f43" },
            { id: "invisible", label: "Invisible", color: "#80848e" }
        ];

        // find Discord's own status setter (name has varied across builds, so try a few shapes)
        const setStatus = (() => {
            const cands = [
                [api.webpack.findByProps("updateStatus"), "updateStatus"],
                [api.webpack.findByProps("setStatus"), "setStatus"],
                [api.webpack.findByProps("updateRemoteSettings", "updateStatus"), "updateStatus"]
            ];
            for (const [mod, fn] of cands) if (mod && typeof mod[fn] === "function") return s => { try { mod[fn](s); return true; } catch { return false; } };
            return null;
        })();

        const curStatus = () => {
            try {
                const US = api.stores.get("UserStore"), PS = api.stores.get("PresenceStore");
                const me = US && US.getCurrentUser && US.getCurrentUser();
                return me && PS && PS.getStatus ? PS.getStatus(me.id) : null;
            } catch { return null; }
        };

        const apply = s => {
            if (!setStatus) { api.toast("Couldn't find Discord's status control", "#f23f43", 2200); return; }
            if (setStatus(s)) api.toast("Status: " + (STATUSES.find(x => x.id === s) || {}).label, "#9dbfea", 1400);
        };

        // auto-invisible on startup (once per Discord launch)
        if (api.settings.get("autoInvisible", false)) setTimeout(() => apply("invisible"), 3500);

        let menu = null;
        const close = () => { if (menu) { menu.remove(); menu = null; } };
        api.on(document, "click", e => { if (menu && !menu.contains(e.target)) close(); }, true);

        const open = () => {
            close();
            const now = curStatus();
            menu = h("div", { id: "beecord-status" });
            menu.style.cssText = "position:fixed;left:50%;bottom:90px;transform:translateX(-50%);z-index:100001;width:min(320px,90vw);" +
                "padding:6px;border-radius:10px;background:var(--ig-popup,#141414);border:1px solid var(--ig-border,#202020);box-shadow:0 10px 40px rgba(0,0,0,.55);" +
                "font:500 13px var(--ig-font,ui-monospace,monospace);color:#dbdee1";
            menu.append(h("div", { style: "padding:4px 8px 8px;font-size:10.5px;font-weight:700;letter-spacing:.04em;color:var(--ig-accent,#9dbfea);text-transform:uppercase" }, "Set status"));
            STATUSES.forEach((s, i) => {
                const on = now === s.id;
                const row = h("div", { style: "display:flex;gap:10px;align-items:center;padding:8px;border-radius:6px;cursor:pointer;" + (on ? "background:rgba(157,191,234,.12)" : "") },
                    h("i", { style: "width:9px;height:9px;border-radius:50%;flex:none;background:" + s.color + ";box-shadow:0 0 7px " + s.color + "88" }),
                    h("span", { style: "flex:1;color:#f2f3f5;font-weight:600" }, s.label),
                    h("b", { style: "flex:none;color:var(--ig-accent,#9dbfea);font-size:11px" }, String(i + 1) + (on ? "  ·  current" : "")));
                row.addEventListener("mouseenter", () => { if (!on) row.style.background = "rgba(157,191,234,.1)"; });
                row.addEventListener("mouseleave", () => { if (!on) row.style.background = ""; });
                row.addEventListener("click", () => { close(); apply(s.id); });
                menu.append(row);
            });
            document.body.append(menu);
        };

        api.on(window, "keydown", e => {
            if (e.ctrlKey && e.shiftKey && !e.altKey && e.key.toLowerCase() === "s") { e.preventDefault(); e.stopPropagation(); menu ? close() : open(); return; }
            if (menu && /^[1-4]$/.test(e.key)) { const s = STATUSES[Number(e.key) - 1]; if (s) { e.preventDefault(); close(); apply(s.id); } }
            if (menu && e.key === "Escape") { e.preventDefault(); close(); }
        }, true);
        api.cleanup(close);
        return true;
    },

    options(api) {
        return [
            api.ui.row("Go invisible automatically when Discord starts",
                api.ui.toggle(api.settings.get("autoInvisible", false), v => api.settings.set("autoInvisible", v))),
            api.ui.note("Press Ctrl+Shift+S anywhere to open the status picker (keys 1-4 pick Online / Idle / DND / Invisible). This only changes your own status.")
        ];
    }
});
