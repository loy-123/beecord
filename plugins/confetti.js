// Confetti: a burst of confetti when a celebration word shows up (gg, congrats, 🎉, happy birthday),
// or any time you press Ctrl+Alt+C. Purely a local visual.
(window.beecord || window.blxstncord).definePlugin({
    id: "confetti",
    name: "Confetti",
    description: "A little confetti burst on “gg”, “congrats”, 🎉 or birthday wishes — or press Ctrl+Alt+C any time.",
    author: "beecord",
    version: "1.0.0",
    category: "Fun",
    enabledByDefault: false,
    webpack: false,

    start(api) {
        const canvas = document.createElement("canvas");
        canvas.style.cssText = "position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:99998";
        document.body.append(canvas);
        const ctx = canvas.getContext("2d");
        api.cleanup(() => canvas.remove());
        let parts = [], raf = 0;
        const colors = ["#9dbfea", "#f2a9bc", "#80d09c", "#e8c478", "#c9a9f2", "#ffffff"];
        const resize = () => { const d = window.devicePixelRatio || 1; canvas.width = innerWidth * d; canvas.height = innerHeight * d; ctx.setTransform(d, 0, 0, d, 0, 0); };
        resize();
        api.on(window, "resize", resize);

        const burst = (x, y, n) => {
            for (let i = 0; i < n; i++) {
                const a = Math.random() * Math.PI * 2, sp = 3 + Math.random() * 7;
                parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 3, g: 0.12 + Math.random() * 0.1,
                    s: 4 + Math.random() * 5, rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 0.3, c: colors[i % colors.length], life: 1 });
            }
            if (!raf) raf = requestAnimationFrame(loop);
        };
        this.__burst = () => burst(innerWidth / 2, innerHeight / 3, 140);
        const loop = () => {
            ctx.clearRect(0, 0, innerWidth, innerHeight);
            parts = parts.filter(p => p.life > 0 && p.y < innerHeight + 30);
            for (const p of parts) {
                p.vy += p.g; p.x += p.vx; p.y += p.vy; p.vx *= 0.99; p.rot += p.vr; p.life -= 0.006;
                ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.globalAlpha = Math.max(0, Math.min(1, p.life));
                ctx.fillStyle = p.c; ctx.fillRect(-p.s / 2, -p.s / 2, p.s, p.s * 0.6); ctx.restore();
            }
            if (parts.length) raf = requestAnimationFrame(loop); else { raf = 0; ctx.clearRect(0, 0, innerWidth, innerHeight); }
        };

        api.on(window, "keydown", e => { if (e.ctrlKey && e.altKey && !e.shiftKey && e.key.toLowerCase() === "c") { e.preventDefault(); burst(innerWidth / 2, innerHeight / 3, 140); } });

        const s0 = Date.now();
        if (api.settings.get("onWords", true)) {
            const RE = /(^|\s)(gg|congrats|congratulations|🎉|🥳|happy birthday|pog)(\s|$|!)/i;
            const seen = new WeakSet();
            api.dom.observe(() => {
                const msgs = document.querySelectorAll('li[id^="chat-messages-"]:not([data-bc-conf])');
                let fired = 0;
                for (const li of msgs) {
                    li.setAttribute("data-bc-conf", "1");
                    if (seen.has(li)) continue; seen.add(li);
                    const c = li.querySelector('[id^="message-content-"]');
                    if (c && RE.test(c.textContent || "") && fired < 1 && Date.now() - s0 > 2500) {
                        const r = li.getBoundingClientRect();
                        burst(r.left + r.width / 2, r.top + r.height / 2, 90); fired++;
                    }
                }
            }, { throttle: 250 });
        }
    },

    options(api) {
        const testBtn = api.ui.h("button", { type: "button", class: "fc-btn", style: "height:28px" }, "Test 🎉");
        testBtn.addEventListener("click", () => { if (this.__burst) this.__burst(); });
        return [
            api.ui.row("Confetti on celebration words (gg, congrats, 🎉)", api.ui.toggle(api.settings.get("onWords", true), v => api.settings.set("onWords", v))),
            api.ui.row("Try it", testBtn),
            api.ui.note("You can always set it off with Ctrl+Alt+C. Word changes apply after toggling the plugin.")
        ];
    }
});
