// Reminders: set a personal reminder, shown as a beecord notice when it's due.
//   In any message box type:  ;remind 10m take a break   ;remind 2h meeting   ;remind 1d call mom
// The ;remind message is NOT sent. Reminders survive a reload (re-armed on start; overdue ones fire at once).
(window.beecord || window.blxstncord).definePlugin({
    id: "reminder",
    name: "Reminders",
    description: "Set personal reminders with ;remind 10m text (s/m/h/d). They pop up as a beecord notice when due and survive a reload.",
    author: "beecord",
    version: "1.0.0",
    category: "Tools",
    enabledByDefault: true,
    webpack: false,

    start(api) {
        const UNITS = { s: 1e3, m: 6e4, h: 36e5, d: 864e5 };
        const timers = new Map();
        const list = () => { const v = api.settings.get("list", []); return Array.isArray(v) ? v : []; };
        const saveList = a => api.settings.set("list", a);
        const fmt = ms => ms >= 864e5 ? Math.round(ms / 864e5) + "d" : ms >= 36e5 ? Math.round(ms / 36e5) + "h" : ms >= 6e4 ? Math.round(ms / 6e4) + "m" : Math.max(1, Math.round(ms / 1e3)) + "s";

        const fire = r => {
            timers.delete(r.id);
            saveList(list().filter(x => x.id !== r.id));
            api.toast("⏰ Reminder: " + r.text, "#9dbfea", 12000);
            try { const a = new (window.AudioContext || window.webkitAudioContext)(); const o = a.createOscillator(), g = a.createGain(); o.connect(g); g.connect(a.destination); o.type = "sine"; o.frequency.value = 880; g.gain.setValueAtTime(0.0001, a.currentTime); g.gain.exponentialRampToValueAtTime(0.2, a.currentTime + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + 0.5); o.start(); o.stop(a.currentTime + 0.5); setTimeout(() => a.close().catch(() => { }), 800); } catch { }
            if (this.__draw) this.__draw();
        };
        const arm = r => {
            const delay = r.at - Date.now();
            if (delay <= 0) return fire(r);
            timers.set(r.id, setTimeout(() => fire(r), Math.min(delay, 2 ** 31 - 1)));
        };
        for (const r of list()) arm(r);
        api.cleanup(() => { for (const t of timers.values()) clearTimeout(t); timers.clear(); this.__draw = null; });

        const addReminder = (ms, text) => {
            const r = { id: Date.now() + "-" + Math.random().toString(36).slice(2, 6), at: Date.now() + ms, text: text.slice(0, 200) };
            saveList(list().concat([r]));
            arm(r);
            api.toast("Reminder set for " + fmt(ms) + " from now", "#4e5058", 2500);
            if (this.__draw) this.__draw();
        };
        this.__add = addReminder;

        api.messages.onSend(msg => {
            if (typeof msg.content !== "string") return;
            const m = /^;remind(?:er)?\s+(\d{1,4})\s*([smhd])\s+([\s\S]+)/i.exec(msg.content.trim());
            if (!m) return;
            const ms = Math.min(Number(m[1]) * UNITS[m[2].toLowerCase()], 30 * 864e5);
            addReminder(ms, m[3].trim());
            return false; // don't send the command as a message
        }, 8);
    },

    options(api) {
        const { h } = api.ui;
        const list = () => { const v = api.settings.get("list", []); return Array.isArray(v) ? v : []; };
        const view = h("div");
        const minutes = api.ui.input(10, () => { }, "10", "number");
        const text = api.ui.input("", () => { }, "what to remember");
        text.style.width = "180px";
        const addBtn = h("button", { type: "button", class: "fc-btn", style: "height:28px" }, "Add");
        addBtn.addEventListener("click", () => {
            const mins = Math.max(1, Math.round(Number(minutes.value) || 0));
            const t = (text.value || "").trim();
            if (!t) return;
            if (this.__add) this.__add(mins * 60000, t);
            text.value = "";
            draw();
        });
        const draw = () => {
            const items = list().slice().sort((a, b) => a.at - b.at);
            view.replaceChildren(
                h("div", { style: "display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:8px" }, "In", minutes, "min:", text, addBtn),
                items.length ? h("div", null, items.map(r => {
                    const left = Math.max(0, r.at - Date.now());
                    const row = h("div", { style: "display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid var(--ig-child-border,#161616);font-size:12px" },
                        h("b", { style: "color:var(--ig-accent,#9dbfea)" }, Math.ceil(left / 60000) + "m"),
                        h("span", { style: "flex:1;min-width:0" }, r.text));
                    const del = h("button", { type: "button", class: "fc-btn sec", style: "height:24px;padding:0 9px;font-size:11px" }, "Cancel");
                    del.addEventListener("click", () => { api.settings.set("list", list().filter(x => x.id !== r.id)); draw(); });
                    row.append(del);
                    return row;
                })) : api.ui.note("No active reminders. Set one above, or type “;remind 10m text” in any chat."));
        };
        this.__draw = draw;
        draw();
        return [view];
    }
});
