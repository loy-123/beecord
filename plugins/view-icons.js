// View Icons: click an avatar or profile banner to open it full-size in a viewer with a download link.
(window.beecord || window.blxstncord).definePlugin({
    id: "view-icons",
    name: "View Icons",
    description: "Click an avatar or profile banner to see it full-size, with a download link. Also works on server icons.",
    author: "beecord",
    version: "1.0.0",
    category: "Look",
    enabledByDefault: false,
    webpack: false,

    start(api) {
        const h = api.ui.h;
        const fullSize = src => {
            let s = src.replace(/([?&])size=\d+/, "$1size=4096");
            if (!/[?&]size=/.test(s)) s += (s.includes("?") ? "&" : "?") + "size=4096";
            return s.replace(/\.(webp|jpg|jpeg)(\?|$)/, ".png$2");
        };
        const bgUrl = el => { const m = /url\("?([^")]+)"?\)/.exec(getComputedStyle(el).backgroundImage || ""); return m ? m[1] : ""; };

        let overlay = null;
        const close = () => { if (overlay) { overlay.remove(); overlay = null; } };
        const view = src => {
            close();
            const big = fullSize(src);
            const img = h("img", { src: big, style: "max-width:90vw;max-height:80vh;border-radius:12px;box-shadow:0 20px 60px rgba(0,0,0,.6);background:#111" });
            const dl = h("a", { href: big, target: "_blank", rel: "noreferrer", style: "margin-top:12px;color:var(--ig-accent,#9dbfea);font:600 13px var(--ig-font,ui-monospace,monospace);text-decoration:none" }, "Open / download in browser");
            img.addEventListener("click", e => e.stopPropagation());
            dl.addEventListener("click", e => e.stopPropagation());
            overlay = h("div", { style: "position:fixed;inset:0;z-index:100002;display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(0,0,0,.72);cursor:zoom-out" }, img, dl);
            overlay.addEventListener("click", close);
            document.body.append(overlay);
        };

        api.on(document, "keydown", e => { if (e.key === "Escape" && overlay) { e.preventDefault(); close(); } }, true);

        api.on(document, "click", e => {
            if (!api.settings.get("on", true)) return;
            const t = e.target;
            if (!t || !t.closest) return;
            let src = "";
            const inProfile = el => el && el.closest('[class*="userPopout"],[class*="userProfile"],[class*="outer_"],[class*="modal"],[class*="profileBanner"]');
            if (t.tagName === "IMG" && /\/(avatars|icons|guilds|users)\//.test(t.src || "")) {
                if (inProfile(t) || t.closest('[data-list-item-id^="guildsnav"],[class*="listItem"]')) src = t.src;
            } else {
                const banner = t.closest('[class*="banner"]:not(img),[class*="bannerImage"]');
                if (banner && inProfile(banner)) src = bgUrl(banner) || (banner.querySelector("img") && banner.querySelector("img").src) || "";
            }
            if (src && /^https?:\/\//.test(src)) { e.preventDefault(); e.stopPropagation(); view(src); }
        }, true);
        api.cleanup(close);
    },

    options(api) {
        return [
            api.ui.row("Enable", api.ui.toggle(api.settings.get("on", true), v => api.settings.set("on", v))),
            api.ui.note("Click an avatar or banner in a profile popout (or a server icon) to view it full-size. Press Esc to close.")
        ];
    }
});
