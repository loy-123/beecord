// Hide Blocked: fully hides messages from users you've blocked or ignored, plus the "N blocked messages" dividers.
(window.beecord || window.blxstncord).definePlugin({
    id: "hide-blocked",
    name: "Hide Blocked",
    description: "Completely hides messages and “blocked messages” dividers from users you've blocked or ignored.",
    author: "beecord",
    version: "1.0.0",
    category: "Privacy & Safety",
    enabledByDefault: false,
    webpack: true,

    start(api) {
        const rel = api.stores.get("RelationshipStore");
        const messages = api.stores.get("MessageStore");
        if (!rel) return false;
        const hidden = api.settings.get("ignored", true);
        const isHidden = id => {
            try { if (rel.isBlocked && rel.isBlocked(id)) return true; if (hidden && rel.isIgnored && rel.isIgnored(id)) return true; } catch { }
            return false;
        };
        api.addStyle(`li[id^="chat-messages-"][data-bc-blocked]{display:none!important}
            [class*="blockedSystemMessage"], [class*="divider"][class*="isBeforeBlocked"]{display:none!important}`);
        const scan = () => {
            let n = 0;
            for (const li of document.querySelectorAll('li[id^="chat-messages-"]:not([data-bc-checked])')) {
                li.setAttribute("data-bc-checked", "1");
                const m = /chat-messages-(\d+)-(\d+)/.exec(li.id);
                if (!m || !messages) continue;
                let author; try { const msg = messages.getMessage(m[1], m[2]); author = msg && msg.author && msg.author.id; } catch { }
                if (author && isHidden(author)) { li.setAttribute("data-bc-blocked", "1"); n++; }
            }
            // "N Blocked Messages" buttons/dividers
            for (const b of document.querySelectorAll('[class*="blocked"]')) {
                if (/\bblocked messages?\b/i.test(b.textContent || "") && b.closest('li,[class*="divider"]')) {
                    const host = b.closest('li,[class*="divider"]'); if (host) host.style.display = "none";
                }
            }
            if (n) this.__count = (this.__count || 0) + n;
        };
        api.dom.observe(scan, { throttle: 250 });
        api.cleanup(() => { for (const li of document.querySelectorAll("[data-bc-blocked]")) { li.removeAttribute("data-bc-blocked"); li.removeAttribute("data-bc-checked"); } });
        return true;
    },

    options(api) {
        return [
            api.ui.row("Also hide ignored users", api.ui.toggle(api.settings.get("ignored", true), v => api.settings.set("ignored", v))),
            api.ui.note("Hidden this session: " + (this.__count || 0) + " message(s). Change applies after toggling the plugin off and on.")
        ];
    }
});
