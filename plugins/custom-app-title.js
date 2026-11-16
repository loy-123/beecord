// Custom App Title: set your own text for the Discord window title.
//   {unread} = number of unread pings, {time} = current time. Example: "Discord {unread}"
(window.beecord || window.blxstncord).definePlugin({
    id: "custom-app-title",
    name: "Custom Window Title",
    description: "Set your own Discord window title. Use {unread} for ping count and {time} for the clock.",
    author: "beecord",
    version: "1.0.0",
    category: "Fun",
    enabledByDefault: false,
    webpack: false,

    start(api) {
        const original = document.title;
        this.__orig = original;
        const unreadCount = () => {
            let n = 0;
            for (const b of document.querySelectorAll('[class*="numberBadge"], [class*="mentionsBadge"], [class*="unreadMentionsBar"]')) {
                const m = /\d+/.exec(b.textContent || ""); if (m) n += Number(m[0]);
            }
            return n;
        };
        const apply = () => {
            let t = String(api.settings.get("title", "")).trim();
            if (!t) { if (document.title !== original) document.title = original; return; }
            t = t.replace(/\{unread\}/gi, () => { const n = unreadCount(); return n ? "(" + n + ")" : ""; })
                .replace(/\{time\}/gi, () => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }))
                .replace(/\s+/g, " ").trim();
            if (document.title !== t) document.title = t;
        };
        apply();
        api.dom.observe(apply, { throttle: 500 });
        const iv = setInterval(apply, 5000);
        api.cleanup(() => { clearInterval(iv); document.title = original; });
    },

    options(api) {
        return [
            api.ui.note("Window title text. {unread} = ping count, {time} = clock. Leave empty to keep Discord's own title."),
            api.ui.textarea(api.settings.get("title", ""), v => api.settings.set("title", v), "Discord {unread}  ·  {time}")
        ];
    }
});
