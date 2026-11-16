// Full Timestamps: shows message times the way you want (24h, seconds, always with the date).
// Safe with React: we never touch Discord's text, we only add a data attribute and show it with CSS ::after.
(window.beecord || window.blxstncord).definePlugin({
    id: "full-timestamps",
    name: "Full Timestamps",
    description: "Shows message times in your format: 24-hour clock, seconds, and the full date instead of \"Today at\" / \"Yesterday at\".",
    author: "beecord",
    version: "1.0.0",
    enabledByDefault: false,
    webpack: false,

    start(api) {
        api.addStyle(`
            li[id^="chat-messages-"] time[data-bc-ts]{font-size:0!important}
            li[id^="chat-messages-"] time[data-bc-ts]::after{content:attr(data-bc-ts);font-size:var(--bc-ts-fs,.75rem)}`);
        const fmtCache = {};
        const fmt = (opts) => { const k = JSON.stringify(opts); return fmtCache[k] || (fmtCache[k] = new Intl.DateTimeFormat(navigator.language || undefined, opts)); };
        const label = (d, short) => {
            const h24 = api.settings.get("h24", true), secs = api.settings.get("seconds", false), mode = api.settings.get("date", "always");
            const time = fmt({ hour: "2-digit", minute: "2-digit", second: secs ? "2-digit" : undefined, hour12: !h24 }).format(d);
            if (short) return time; // the small hover time next to grouped messages
            const now = new Date(), y = new Date(now); y.setDate(now.getDate() - 1);
            const same = (a, b) => a.toDateString() === b.toDateString();
            if (mode === "relative" && same(d, now)) return time;
            const date = fmt({ year: d.getFullYear() === now.getFullYear() && mode !== "always" ? undefined : "numeric", month: "2-digit", day: "2-digit" }).format(d);
            if (mode === "relative" && same(d, y)) return (navigator.language || "").startsWith("pl") ? "wczoraj " + time : "yesterday " + time;
            return date + " " + time;
        };
        const fix = el => {
            const iso = el.getAttribute("datetime");
            if (!iso) return;
            const d = new Date(iso);
            if (isNaN(d)) return;
            // grouped messages show a small time in the gutter; keep that one short
            const short = !el.closest("h3"); // the message header (name + time) is an <h3>; gutter times are not
            const text = label(d, short);
            if (el.getAttribute("data-bc-ts") === text) return;
            if (!el.style.getPropertyValue("--bc-ts-fs")) {
                el.removeAttribute("data-bc-ts");
                el.style.setProperty("--bc-ts-fs", getComputedStyle(el).fontSize);
            }
            el.setAttribute("data-bc-ts", text);
        };
        const scan = root => { for (const el of (root.querySelectorAll ? root.querySelectorAll('li[id^="chat-messages-"] time[datetime]') : [])) fix(el); };
        // shared core watcher; the 60 s interval also refreshes "today/yesterday" after midnight
        api.dom.observe(() => scan(document), { interval: 60000 });
        this.__rescan = () => scan(document);
        api.cleanup(() => {
            this.__rescan = null;
            for (const el of document.querySelectorAll("time[data-bc-ts]")) { el.removeAttribute("data-bc-ts"); el.style.removeProperty("--bc-ts-fs"); }
        });
    },

    options(api) {
        const set = (k, v) => { api.settings.set(k, v); if (this.__rescan) this.__rescan(); };
        return [
            api.ui.row("24-hour clock", api.ui.toggle(api.settings.get("h24", true), v => set("h24", v))),
            api.ui.row("Show seconds", api.ui.toggle(api.settings.get("seconds", false), v => set("seconds", v))),
            api.ui.row("Date", api.ui.select([["always", "Always full date"], ["year", "Date, year only if not this year"], ["relative", "Only for older messages"]],
                api.settings.get("date", "always"), v => set("date", v))),
            api.ui.note("Hovering a timestamp still shows Discord's full tooltip.")
        ];
    }
});
