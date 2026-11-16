// Typing Sounds: soft keyboard click sounds while you type a message (generated, no audio files).
(window.beecord || window.blxstncord).definePlugin({
    id: "typing-sounds",
    name: "Typing Sounds",
    description: "Plays a soft keyboard sound while you type in the message box. Pick the style and volume.",
    author: "beecord",
    version: "1.0.0",
    enabledByDefault: false,
    webpack: false,

    start(api) {
        let ctx = null;
        const audio = () => {
            if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; } }
            if (ctx.state === "suspended") ctx.resume().catch(() => { });
            return ctx;
        };
        api.cleanup(() => { if (ctx) ctx.close().catch(() => { }); ctx = null; });

        const STYLES = {
            soft: { freq: 1800, dur: 0.035, noise: 0.6, tone: 0.15 },
            mechanical: { freq: 3200, dur: 0.05, noise: 1, tone: 0.35 },
            typewriter: { freq: 900, dur: 0.07, noise: 0.8, tone: 0.6 },
            bubble: { freq: 600, dur: 0.06, noise: 0, tone: 1 }
        };
        const play = (big) => {
            const a = audio();
            if (!a) return;
            const s = STYLES[api.settings.get("style", "soft")] || STYLES.soft;
            const v = Math.min(100, Math.max(0, Number(api.settings.get("volume", 40)))) / 100 * (big ? 1.3 : 1);
            const t = a.currentTime, dur = s.dur * (big ? 1.6 : 1);
            const out = a.createGain();
            out.gain.setValueAtTime(v * 0.5, t);
            out.gain.exponentialRampToValueAtTime(0.0001, t + dur);
            out.connect(a.destination);
            const jitter = 1 + (Math.random() - 0.5) * 0.15;
            if (s.noise) {
                const len = Math.ceil(a.sampleRate * dur);
                const buf = a.createBuffer(1, len, a.sampleRate);
                const d = buf.getChannelData(0);
                for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
                const src = a.createBufferSource();
                src.buffer = buf;
                const f = a.createBiquadFilter();
                f.type = "bandpass"; f.frequency.value = s.freq * jitter; f.Q.value = 1.2;
                const g = a.createGain(); g.gain.value = s.noise;
                src.connect(f).connect(g).connect(out);
                src.start(t);
            }
            if (s.tone) {
                const o = a.createOscillator();
                o.type = "sine";
                o.frequency.setValueAtTime(s.freq / 4 * jitter * (big ? 0.7 : 1), t);
                o.frequency.exponentialRampToValueAtTime(s.freq / 8, t + dur);
                const g = a.createGain(); g.gain.value = s.tone * 0.6;
                o.connect(g).connect(out);
                o.start(t); o.stop(t + dur);
            }
        };
        api.on(document, "keydown", e => {
            if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
            const t = e.target;
            if (!t || !t.closest || !t.closest('[role="textbox"], textarea, input[type="text"], input:not([type])')) return;
            if (api.settings.get("onlyChat", true) && !t.closest('[data-slate-editor="true"]')) return;
            if (e.key.length !== 1 && !["Backspace", "Enter", "Delete", "Tab"].includes(e.key)) return;
            play(e.key === "Enter" || e.key === " " || e.key === "Backspace");
        }, true);
        this.__play = play;
        api.cleanup(() => { this.__play = null; });
    },

    options(api) {
        const label = api.ui.h("span", null, api.settings.get("volume", 40) + "%");
        const slider = api.ui.h("input", { type: "range", min: "5", max: "100", step: "5" });
        slider.value = String(api.settings.get("volume", 40));
        slider.style.cssText = "width:160px;accent-color:#5865f2";
        slider.addEventListener("input", () => { label.textContent = slider.value + "%"; api.settings.set("volume", Number(slider.value)); });
        slider.addEventListener("change", () => this.__play && this.__play(false));
        return [
            api.ui.row("Sound", api.ui.select([["soft", "Soft"], ["mechanical", "Mechanical"], ["typewriter", "Typewriter"], ["bubble", "Bubble"]],
                api.settings.get("style", "soft"), v => { api.settings.set("style", v); if (this.__play) this.__play(false); })),
            api.ui.row("Volume", api.ui.h("div", { style: "display:flex;align-items:center;gap:10px" }, slider, label)),
            api.ui.row("Only in the message box", api.ui.toggle(api.settings.get("onlyChat", true), v => api.settings.set("onlyChat", v)))
        ];
    }
});
