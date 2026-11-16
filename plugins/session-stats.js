// Session Stats: tracks what you do this session (messages sent, time on Discord, channels opened) and
// shows it in a small toggleable HUD. Everything stays on your PC.
(window.beecord || window.blxstncord).definePlugin({
    id: "session-stats",
    name: "Session Stats",
    description: "A small HUD with your session stats: time on Discord, messages sent, and channels opened. Click it to hide.",
    author: "beecord",
    version: "1.0.0",
    category: "Fun",
    enabledByDefault: false,
    webpack: false,

    start(api) {
        const { h } = api.ui;
        const s = this.__s = { start: Date.now(), sent: 0, channels: new Set() };
        const totalSent = () => Number(api.settings.get("totalSent", 0)) || 0;

        api.messages.onSend((msg, ctx) => { if (!ctx.edit) { s.sent++; api.settings.set("totalSent", totalSent() + 1); } }, 99);

        const el = h("div", { id: "beecord-stats", title: "Click to hide until next launch" });
        el.style.cssText = "position:fixed;bottom:8px;left:76px;z-index:1000;padding:6px 11px;border-radius:9px;cursor:pointer;" +
            "background:rgba(0,0,0,.5);color:#cdd3dc;font:500 11px var(--ig-font,ui-monospace,monospace);line-height:1.5;backdrop-filter:blur(4px);border:1px solid rgba(255,255,255,.06)";
        document.body.append(el);
        el.addEventListener("click", () => el.remove());
        api.cleanup(() => el.remove());

        const fmt = ms => { const m = Math.floor(ms / 60000), hr = Math.floor(m / 60); return hr ? hr + "h " + (m % 60) + "m" : m + "m " + (Math.floor(ms / 1000) % 60) + "s"; };
        const draw = () => {
            // count the current channel as visited
            const m = /\/channels\/[^/]+\/(\d+)/.exec(location.pathname); if (m) s.channels.add(m[1]);
            el.innerHTML = "";
            const rows = [["⏱ session", fmt(Date.now() - s.start)], ["✉ sent", s.sent + " (" + totalSent() + " all time)"], ["📂 channels", String(s.channels.size)]];
            for (const [k, v] of rows) el.append(h("div", null, h("span", { style: "opacity:.6" }, k + "  "), h("b", { style: "color:#e8ecf2" }, v)));
        };
        draw();
        const iv = setInterval(draw, 1000);
        api.cleanup(() => clearInterval(iv));
    },

    options(api) {
        const s = this.__s;
        const total = Number(api.settings.get("totalSent", 0)) || 0;
        const resetBtn = api.ui.h("button", { type: "button", class: "fc-btn sec", style: "height:28px" }, "Reset all-time count");
        resetBtn.addEventListener("click", () => { api.settings.set("totalSent", 0); resetBtn.textContent = "Done"; });
        return [
            api.ui.note("All-time messages sent (with beecord on): " + total + "."),
            api.ui.row("All-time counter", resetBtn),
            api.ui.note("The HUD sits bottom-left above the user area. Click it to hide it until the next launch.")
        ];
    }
});
