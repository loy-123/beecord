// Pause GIFs: freezes animated GIFs and GIF avatars until you hover them (quieter chat, less CPU).
// Discord already pauses on some, this covers message images and avatars; animated custom emoji get a hover-to-play.
(window.beecord || window.blxstncord).definePlugin({
    id: "pause-gifs",
    name: "Pause GIFs",
    description: "Freezes GIFs in chat (and animated avatars) until you hover them. Quieter, lighter on the CPU.",
    author: "beecord",
    version: "1.0.0",
    category: "Look",
    enabledByDefault: false,
    webpack: false,

    start(api) {
        const freeze = img => {
            if (img.__bcFrozen || !img.naturalWidth) return;
            try {
                const c = document.createElement("canvas");
                c.width = img.naturalWidth; c.height = img.naturalHeight;
                c.getContext("2d").drawImage(img, 0, 0);
                img.__bcGifSrc = img.src;
                img.__bcStill = c.toDataURL("image/png");
                img.__bcFrozen = true;
                img.src = img.__bcStill;
            } catch { img.__bcFrozen = "cors"; } // tainted canvas: can't freeze, leave it
        };
        const isGif = img => /\.gif($|[?#])/i.test(img.src || "") || /\/a_/.test(img.src || "") || (img.src || "").includes("format=gif");
        const scan = () => {
            if (!api.settings.get("on", true)) return;
            for (const img of document.querySelectorAll('li[id^="chat-messages-"] img, img[class*="avatar"], [class*="imageWrapper"] img')) {
                if (img.__bcSeen) continue;
                img.__bcSeen = 1;
                if (!isGif(img)) continue;
                if (img.complete) freeze(img); else img.addEventListener("load", () => freeze(img), { once: true });
                img.addEventListener("mouseenter", () => { if (img.__bcFrozen === true && img.__bcGifSrc) img.src = img.__bcGifSrc; });
                img.addEventListener("mouseleave", () => { if (img.__bcFrozen === true && img.__bcStill) img.src = img.__bcStill; });
                img.style.cursor = "pointer";
            }
        };
        api.dom.observe(scan, { throttle: 300 });
        api.cleanup(() => { for (const img of document.querySelectorAll("img")) { if (img.__bcFrozen === true && img.__bcGifSrc) img.src = img.__bcGifSrc; } });
    },

    options(api) {
        return [
            api.ui.row("Freeze GIFs until hover", api.ui.toggle(api.settings.get("on", true), v => api.settings.set("on", v))),
            api.ui.note("Hover a frozen GIF to play it; move away to freeze it again. Some embedded GIFs can't be frozen and are left playing.")
        ];
    }
});
