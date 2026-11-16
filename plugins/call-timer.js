// Call Timer: shows how long you've been in the current voice call, in a small HUD.
(window.beecord || window.blxstncord).definePlugin({
    id: "call-timer",
    name: "Call Timer",
    description: "Shows how long you've been connected to the current voice call.",
    author: "beecord",
    version: "1.0.0",
    category: "Tools",
    enabledByDefault: false,
    webpack: false,

    start(api) {
        const { h } = api.ui;
        const el = h("div", { id: "beecord-calltimer" });
        el.style.cssText = "position:fixed;top:8px;left:50%;transform:translateX(-50%);z-index:1000;display:none;align-items:center;gap:7px;padding:4px 12px;border-radius:9px;pointer-events:none;" +
            "background:rgba(0,0,0,.5);color:#80d09c;font:600 12px var(--ig-font,ui-monospace,monospace);backdrop-filter:blur(4px);border:1px solid rgba(128,208,156,.25)";
        const dot = h("i", { style: "width:7px;height:7px;border-radius:50%;background:#80d09c;box-shadow:0 0 8px #80d09c" });
        const label = h("span");
        el.append(dot, label);
        document.body.append(el);
        api.cleanup(() => el.remove());

        let start = 0;
        const inCall = () => !!document.querySelector('[aria-label="Disconnect"], button[aria-label*="Disconnect"]');
        const tick = () => {
            if (inCall()) {
                if (!start) start = Date.now();
                const s = Math.floor((Date.now() - start) / 1000);
                const hh = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60), ss = s % 60;
                const p = n => String(n).padStart(2, "0");
                label.textContent = "In call  " + (hh ? hh + ":" : "") + p(mm) + ":" + p(ss);
                el.style.display = "flex";
            } else { start = 0; el.style.display = "none"; }
        };
        tick();
        const iv = setInterval(tick, 1000);
        api.dom.observe(tick, { throttle: 500 });
        api.cleanup(() => clearInterval(iv));
    },

    options(api) {
        return [api.ui.note("A green timer appears at the top while you're connected to voice.")];
    }
});
