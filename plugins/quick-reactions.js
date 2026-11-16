// Quick Reactions: hover a message to get a little row of your favourite emoji; click one to react.
// Uses Discord's own reaction action (no token handling).
(window.beecord || window.blxstncord).definePlugin({
    id: "quick-reactions",
    name: "Quick Reactions",
    description: "Hover a message to get one-click buttons for your favourite reactions.",
    author: "beecord",
    version: "1.0.0",
    category: "Chat",
    enabledByDefault: false,
    webpack: true,

    start(api) {
        const Rx = api.webpack.findByProps(["addReaction"], "addReaction");
        if (!Rx) return false;
        const { h } = api.ui;
        const favs = () => { const v = api.settings.get("favs", "👍 ❤️ 😂 🔥 👀"); return String(v).trim().split(/\s+/).filter(Boolean).slice(0, 8); };

        const bar = h("div", { id: "beecord-quickreact" });
        bar.style.cssText = "position:fixed;z-index:9999;display:none;gap:2px;padding:3px;border-radius:8px;background:var(--ig-popup,#141414);border:1px solid var(--ig-border,#202020);box-shadow:0 4px 16px rgba(0,0,0,.4)";
        document.body.append(bar);
        api.cleanup(() => bar.remove());
        let cur = null, hideT = null;

        const render = () => {
            bar.replaceChildren();
            for (const emo of favs()) {
                const b = h("button", { type: "button", title: "React " + emo, style: "all:unset;cursor:pointer;padding:3px 5px;border-radius:6px;font-size:15px;line-height:1" }, emo);
                b.addEventListener("mouseenter", () => b.style.background = "rgba(255,255,255,.08)");
                b.addEventListener("mouseleave", () => b.style.background = "");
                b.addEventListener("click", () => {
                    if (!cur) return;
                    try { Rx.addReaction(cur[0], cur[1], { name: emo }); } catch (e) { api.toast("Couldn't react: " + (e && e.message || e), "#e88080", 2500); }
                    hide();
                });
                bar.append(b);
            }
        };
        const hide = () => { bar.style.display = "none"; cur = null; };
        const place = li => {
            const m = /chat-messages-(\d+)-(\d+)/.exec(li.id); if (!m) return;
            cur = [m[1], m[2]];
            render();
            const r = li.getBoundingClientRect();
            bar.style.display = "flex";
            const w = bar.offsetWidth || 160;
            bar.style.left = Math.min(innerWidth - w - 8, r.right - w - 8) + "px";
            bar.style.top = Math.max(6, r.top - 16) + "px";
        };
        api.on(document, "mouseover", e => {
            const t = e.target;
            if (t === bar || (t.closest && t.closest("#beecord-quickreact"))) { clearTimeout(hideT); return; }
            const li = t.closest && t.closest('li[id^="chat-messages-"]');
            if (li) { clearTimeout(hideT); place(li); }
            else if (cur) { clearTimeout(hideT); hideT = setTimeout(hide, 200); }
        }, true);
        api.on(document, "scroll", hide, true);
        return true;
    },

    options(api) {
        return [
            api.ui.note("Favourite emoji (space separated). Use standard emoji here:"),
            api.ui.textarea(api.settings.get("favs", "👍 ❤️ 😂 🔥 👀"), v => api.settings.set("favs", v), "👍 ❤️ 😂 🔥 👀"),
            api.ui.note("Hover a message and click an emoji to react. Custom server emoji aren't supported here yet.")
        ];
    }
});
