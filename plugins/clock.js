// Clock: a small always-visible clock in the corner of Discord (your local time, optional seconds and a second zone).
(window.beecord || window.blxstncord).definePlugin({
    id: "clock",
    name: "Clock",
    description: "A small clock in the corner of Discord, with optional seconds and a second time zone.",
    author: "beecord",
    version: "1.0.0",
    category: "Fun",
    enabledByDefault: false,
    webpack: false,

    start(api) {
        const { h } = api.ui;
        const el = h("div", { id: "beecord-clock" });
        const pos = api.settings.get("pos", "br");
        const edge = { br: "bottom:8px;right:16px", bl: "bottom:8px;left:76px", tr: "top:8px;right:16px", tl: "top:8px;left:76px" }[pos] || "bottom:8px;right:16px";
        el.style.cssText = "position:fixed;" + edge + ";z-index:1000;pointer-events:none;padding:3px 10px;border-radius:8px;" +
            "background:rgba(0,0,0,.45);color:#e8ecf2;font:600 12px var(--ig-font,ui-monospace,monospace);letter-spacing:.02em;backdrop-filter:blur(4px)";
        document.body.append(el);
        api.cleanup(() => el.remove());

        const tick = () => {
            const secs = api.settings.get("seconds", false), h24 = api.settings.get("h24", true);
            const o = { hour: "2-digit", minute: "2-digit", second: secs ? "2-digit" : undefined, hour12: !h24 };
            let txt = new Date().toLocaleTimeString([], o);
            const tz = api.settings.get("tz", "");
            if (tz) { try { txt += "  ·  " + new Date().toLocaleTimeString([], Object.assign({ timeZone: tz }, o)); } catch { } }
            el.textContent = txt;
        };
        tick();
        const t = setInterval(tick, 1000);
        api.cleanup(() => clearInterval(t));
        this.__tick = tick;
    },

    options(api) {
        const re = () => { if (this.__tick) this.__tick(); };
        const zones = ["", "UTC", "America/New_York", "America/Los_Angeles", "America/Chicago", "Europe/London", "Europe/Paris", "Europe/Warsaw", "Europe/Moscow", "Asia/Tokyo", "Asia/Shanghai", "Asia/Kolkata", "Australia/Sydney"];
        return [
            api.ui.row("24-hour clock", api.ui.toggle(api.settings.get("h24", true), v => { api.settings.set("h24", v); re(); })),
            api.ui.row("Show seconds", api.ui.toggle(api.settings.get("seconds", false), v => { api.settings.set("seconds", v); re(); })),
            api.ui.row("Corner", api.ui.select([["br", "Bottom-right"], ["bl", "Bottom-left"], ["tr", "Top-right"], ["tl", "Top-left"]], api.settings.get("pos", "br"), v => api.settings.set("pos", v))),
            api.ui.row("Second time zone", api.ui.select(zones.map(z => [z, z || "none"]), api.settings.get("tz", ""), v => { api.settings.set("tz", v); re(); })),
            api.ui.note("Corner change applies after turning the plugin off and on.")
        ];
    }
});
