// Emoji Zoom: hover a custom emoji, sticker or reaction to see a large preview with its name.
(window.beecord || window.blxstncord).definePlugin({
    id: "emoji-zoom",
    name: "Emoji Zoom",
    description: "Hover a custom emoji, sticker or reaction in chat to see a big preview and its name.",
    author: "beecord",
    version: "1.0.0",
    category: "Look",
    enabledByDefault: false,
    webpack: false,

    start(api) {
        const { h } = api.ui;
        const pop = h("div", { id: "beecord-emojizoom" });
        pop.style.cssText = "position:fixed;z-index:100000;display:none;flex-direction:column;align-items:center;gap:6px;padding:10px;border-radius:12px;pointer-events:none;" +
            "background:var(--ig-popup,#141414);border:1px solid var(--ig-border,#202020);box-shadow:0 8px 32px rgba(0,0,0,.5)";
        const img = h("img", { style: "width:120px;height:120px;object-fit:contain;image-rendering:auto" });
        const name = h("div", { style: "font:600 12px var(--ig-font,ui-monospace,monospace);color:#e8ecf2;max-width:160px;text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" });
        pop.append(img, name);
        document.body.append(pop);
        api.cleanup(() => pop.remove());

        const srcOf = el => {
            if (el.tagName === "IMG") return el.src;
            const bg = getComputedStyle(el).backgroundImage; const m = /url\("?([^")]+)"?\)/.exec(bg); return m ? m[1] : "";
        };
        const show = (src, label, x, y) => {
            if (!src) return;
            img.src = src.replace(/(\?|&)size=\d+/, "$1size=160").replace(/\.webp/, ".webp");
            name.textContent = label || "";
            name.style.display = label ? "block" : "none";
            pop.style.display = "flex";
            const w = 150, hgt = label ? 170 : 150;
            pop.style.left = Math.min(innerWidth - w - 8, Math.max(8, x - w / 2)) + "px";
            pop.style.top = Math.max(8, y - hgt - 14) + "px";
        };
        api.on(document, "mouseover", e => {
            const t = e.target;
            if (!t || !t.closest) return;
            const em = t.closest('img[class*="emoji"], [class*="emoji"] img, img[data-type="emoji"], img[alt^=":"]');
            const sticker = t.closest('img[class*="sticker"], [class*="sticker"] img');
            const reaction = t.closest('[class*="reaction"] img');
            const el = em || sticker || reaction;
            if (!el || el.closest("#blxstncord-panel")) return;
            const r = el.getBoundingClientRect();
            if (r.width > 72) { pop.style.display = "none"; return; } // already big
            const label = el.getAttribute("alt") || el.getAttribute("aria-label") || "";
            show(srcOf(el), label.replace(/^:|:$/g, ""), r.left + r.width / 2, r.top);
        }, true);
        api.on(document, "mouseout", e => { if (!e.relatedTarget || !e.relatedTarget.closest || !e.relatedTarget.closest('[class*="emoji"],[class*="sticker"],[class*="reaction"]')) pop.style.display = "none"; }, true);
    },

    options(api) {
        return [api.ui.note("Hover any custom emoji, sticker or reaction in a message to see a large preview.")];
    }
});
