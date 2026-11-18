// Hotkeys: bind your own keyboard shortcuts to common actions — open beecord, toggle mute/deafen,
// toggle invisible, mark the current channel read, or reload. Each shortcut needs a modifier
// (Ctrl/Shift/Alt). Actions that rely on a Discord module degrade to a toast if it isn't found.
(window.beecord || window.blxstncord).definePlugin({
    id: "hotkeys",
    name: "Hotkeys",
    description: "Assign custom keyboard shortcuts to actions: open beecord, toggle mute/deafen, toggle invisible, mark read, reload. Each needs a modifier.",
    author: "beecord",
    version: "1.0.0",
    category: "Tools",
    enabledByDefault: false,
    webpack: true,

    start(api) {
        const callProp = (prop, ...args) => {
            const m = api.webpack.findByProps(prop);
            if (m && typeof m[prop] === "function") { try { m[prop](...args); return true; } catch { } }
            api.toast("That action isn't available right now", "#e8c478", 1700); return false;
        };
        const toggleInvisible = () => {
            const m = api.webpack.findByProps("updateStatus") || api.webpack.findByProps("setStatus");
            const fn = m && (m.updateStatus || m.setStatus);
            if (!fn) { api.toast("Status control not found", "#e8c478", 1700); return; }
            let cur = null;
            try { const US = api.stores.get("UserStore"), PS = api.stores.get("PresenceStore"); const me = US && US.getCurrentUser && US.getCurrentUser(); cur = me && PS && PS.getStatus ? PS.getStatus(me.id) : null; } catch { }
            const next = cur === "invisible" ? "online" : "invisible";
            try { fn.call(m, next); api.toast("Status: " + next, "#9dbfea", 1300); } catch { }
        };
        const markRead = () => {
            try {
                const SC = api.stores.get("SelectedChannelStore");
                const cid = SC && SC.getChannelId && SC.getChannelId();
                const m = api.webpack.findByProps("ackChannel") || api.webpack.findByProps("ack");
                const fn = m && (m.ackChannel || m.ack);
                if (cid && fn) { fn.call(m, cid); api.toast("Marked read", "#80d09c", 1100); return; }
            } catch { }
            api.toast("Couldn't mark read here", "#e8c478", 1700);
        };

        const ACTIONS = [
            { id: "panel", label: "Open beecord panel", run: () => { const bc = window.beecord || window.blxstncord; bc && bc.open ? bc.open() : api.toast("beecord panel unavailable", "#e8c478", 1600); } },
            { id: "mute", label: "Toggle mute", run: () => callProp("toggleSelfMute") },
            { id: "deafen", label: "Toggle deafen", run: () => callProp("toggleSelfDeaf") },
            { id: "invisible", label: "Toggle invisible", run: toggleInvisible },
            { id: "markread", label: "Mark channel read", run: markRead },
            { id: "reload", label: "Reload Discord", run: () => location.reload() }
        ];

        const binds = () => { const v = api.settings.get("binds", {}); return v && typeof v === "object" ? v : {}; };
        const norm = e => (e.key && e.key.length === 1) ? e.key.toLowerCase() : e.key;

        api.on(window, "keydown", e => {
            if (e.repeat || ["Control", "Shift", "Alt", "Meta"].includes(e.key)) return;
            if (!(e.ctrlKey || e.shiftKey || e.altKey)) return;
            const k = norm(e), b = binds();
            for (const a of ACTIONS) {
                const c = b[a.id];
                if (c && !!c.ctrl === e.ctrlKey && !!c.shift === e.shiftKey && !!c.alt === e.altKey && c.key === k) {
                    e.preventDefault(); e.stopPropagation(); a.run(); return;
                }
            }
        }, true);
        return true;
    },

    options(api) {
        const h = api.ui.h;
        const ACTIONS = [
            ["panel", "Open beecord panel"], ["mute", "Toggle mute"], ["deafen", "Toggle deafen"],
            ["invisible", "Toggle invisible"], ["markread", "Mark channel read"], ["reload", "Reload Discord"]
        ];
        const binds = () => { const v = api.settings.get("binds", {}); return v && typeof v === "object" ? v : {}; };
        const comboStr = c => c ? [c.ctrl && "Ctrl", c.shift && "Shift", c.alt && "Alt", (c.key && c.key.length === 1) ? c.key.toUpperCase() : c.key].filter(Boolean).join("+") : "Not set";

        const view = h("div");
        const draw = () => {
            const b = binds();
            const rows = ACTIONS.map(([id, label]) => {
                const current = h("span", { style: "min-width:120px;text-align:right;font-size:12px;color:" + (b[id] ? "var(--ig-accent,#9dbfea)" : "#6c7280") }, comboStr(b[id]));
                const rec = h("button", { type: "button", class: "fc-btn sec", style: "height:28px" }, "Record");
                rec.addEventListener("click", () => {
                    rec.textContent = "press keys…";
                    const onKey = e => {
                        if (["Control", "Shift", "Alt", "Meta"].includes(e.key)) return;
                        e.preventDefault(); e.stopPropagation();
                        window.removeEventListener("keydown", onKey, true);
                        if (e.key === "Escape") { draw(); return; }
                        if (!(e.ctrlKey || e.shiftKey || e.altKey)) { api.toast("Use a modifier (Ctrl / Shift / Alt)", "#e8c478", 1900); draw(); return; }
                        const nb = binds();
                        nb[id] = { ctrl: e.ctrlKey, shift: e.shiftKey, alt: e.altKey, key: (e.key.length === 1) ? e.key.toLowerCase() : e.key };
                        api.settings.set("binds", nb); draw();
                    };
                    window.addEventListener("keydown", onKey, true);
                });
                const clear = h("button", { type: "button", class: "fc-btn sec", style: "height:28px" }, "Clear");
                clear.addEventListener("click", () => { const nb = binds(); delete nb[id]; api.settings.set("binds", nb); draw(); });
                return h("div", { style: "display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid var(--ig-child-border,#161616)" },
                    h("span", { style: "flex:1;font-size:13px;color:#dbdee1" }, label), current, rec, clear);
            });
            view.replaceChildren(api.ui.note("Click Record, then press your shortcut (must include Ctrl, Shift, or Alt). Actions that need a Discord feature (mute, status, mark-read) show a toast if unavailable."), ...rows);
        };
        draw();
        return [view];
    }
});
