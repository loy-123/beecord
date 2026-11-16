// Media Volume: videos and audio files in chat start at your volume instead of full blast,
// and starting one pauses the others.
(window.beecord || window.blxstncord).definePlugin({
    id: "media-volume",
    name: "Media Volume",
    description: "Videos and audio in chat start at your chosen volume (not 100%), and playing one pauses the others.",
    author: "beecord",
    version: "1.0.0",
    enabledByDefault: true,
    webpack: false,

    start(api) {
        const seen = new WeakSet();
        const vol = () => Math.min(100, Math.max(0, Number(api.settings.get("volume", 30)))) / 100;
        const inChat = el => !!el.closest('li[id^="chat-messages-"], [class*="imageWrapper"], [class*="mosaicItem"], [class*="modal"], [class*="layer"]');
        const setup = el => {
            if (seen.has(el) || !inChat(el)) return;
            seen.add(el);
            el.volume = vol();
            // Discord's player may set its own volume when it mounts; apply ours again on the first play
            el.addEventListener("play", () => { if (!el.__bcUser) el.volume = vol(); }, { once: true });
            el.addEventListener("volumechange", () => { if (el.__bcArmed) el.__bcUser = true; });
            setTimeout(() => { el.__bcArmed = true; }, 1500);
        };
        const scan = () => { for (const el of document.querySelectorAll("video, audio")) setup(el); };
        api.dom.observe(scan); // shared core watcher

        api.on(document, "play", e => {
            const el = e.target;
            if (!(el instanceof HTMLMediaElement)) return;
            setup(el);
            if (!api.settings.get("exclusive", true)) return;
            for (const o of document.querySelectorAll("video, audio")) {
                if (o !== el && !o.paused && inChat(o) && !o.muted) { try { o.pause(); } catch { } }
            }
        }, true);
    },

    options(api) {
        const label = api.ui.h("span", null, api.settings.get("volume", 30) + "%");
        const slider = api.ui.h("input", { type: "range", min: "0", max: "100", step: "5" });
        slider.value = String(api.settings.get("volume", 30));
        slider.style.cssText = "width:160px;accent-color:#5865f2";
        slider.addEventListener("input", () => { label.textContent = slider.value + "%"; api.settings.set("volume", Number(slider.value)); });
        return [
            api.ui.row("Start volume", api.ui.h("div", { style: "display:flex;align-items:center;gap:10px" }, slider, label)),
            api.ui.row("Pause other media when one starts", api.ui.toggle(api.settings.get("exclusive", true), v => api.settings.set("exclusive", v))),
            api.ui.note("Changing the volume in a player still works as usual; this only sets where each new video starts.")
        ];
    }
});
