// Call Timer: shows how long you've been connected to the current voice call, in a small HUD.
// Uses Discord's voice store (not the on-screen buttons), so it runs from the moment you join until you
// leave, and does NOT reset or disappear when you launch a game or the UI re-renders.
(window.beecord || window.blxstncord).definePlugin({
    id: "call-timer",
    name: "Call Timer",
    description: "Shows how long you've been in the current voice call. Runs from join to disconnect; never resets on game launch.",
    author: "beecord",
    version: "2.0.0",
    category: "Tools",
    enabledByDefault: false,
    webpack: true,

    start(api) {
        // Discord's SelectedChannelStore knows which voice channel you're in (null when not connected).
        const sel = api.stores && api.stores.get("SelectedChannelStore");
        const getVoiceId = () => {
            try {
                if (sel && typeof sel.getVoiceChannelId === "function") return sel.getVoiceChannelId() || null;
            } catch { }
            // fallback: DOM (the connected panel / disconnect button)
            return document.querySelector('[aria-label="Disconnect"], button[aria-label*="Disconnect"], section[class*="rtcConnectionStatus"]') ? "dom" : null;
        };
        if (!sel && !getVoiceId) return false;

        const { h } = api.ui;
        const el = h("div", { id: "beecord-calltimer" });
        el.style.cssText = "position:fixed;top:8px;left:50%;transform:translateX(-50%);z-index:1000;display:none;align-items:center;gap:7px;padding:4px 12px;border-radius:9px;pointer-events:none;" +
            "background:rgba(0,0,0,.5);color:#80d09c;font:600 12px var(--ig-font,ui-monospace,monospace);backdrop-filter:blur(4px);border:1px solid rgba(128,208,156,.25)";
        const dot = h("i", { style: "width:7px;height:7px;border-radius:50%;background:#80d09c;box-shadow:0 0 8px #80d09c" });
        const label = h("span");
        el.append(dot, label);
        document.body.append(el);
        api.cleanup(() => el.remove());

        let start = 0;        // when the current connection began
        let curChannel = null;

        const tick = () => {
            const vid = getVoiceId();
            if (vid) {
                // start the clock on first connect, and restart it only if you actually move to a different channel
                if (!start || (vid !== curChannel && vid !== "dom" && curChannel !== "dom")) { start = Date.now(); }
                curChannel = vid;
                const s = Math.floor((Date.now() - start) / 1000);
                const hh = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60), ss = s % 60;
                const p = n => String(n).padStart(2, "0");
                label.textContent = "In call  " + (hh ? hh + ":" : "") + p(mm) + ":" + p(ss);
                if (el.style.display !== "flex") el.style.display = "flex";
            } else if (start) {
                start = 0; curChannel = null; el.style.display = "none";
            }
        };
        tick();
        const iv = setInterval(tick, 1000);   // once a second is enough; no DOM scanning
        api.cleanup(() => clearInterval(iv));
        return true;
    },

    options(api) {
        return [api.ui.note("A green timer appears at the top while you're connected to a voice call, counting from when you joined.")];
    }
});
