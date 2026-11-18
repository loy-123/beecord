// Keyword Censor: hide or blur any message that contains a word you list (your address, real name,
// a project codename…), so it's not visible on screen when you share or screenshot. Blurred messages
// reveal on hover. Purely visual and local — it changes nothing for anyone else and sends no message.
(window.beecord || window.blxstncord).definePlugin({
    id: "keyword-censor",
    name: "Keyword Censor",
    description: "Blur or hide messages containing sensitive words (for screen-sharing privacy). Blurred messages reveal on hover. Local & visual only.",
    author: "beecord",
    version: "1.0.0",
    category: "Privacy & Safety",
    enabledByDefault: false,
    webpack: false,

    start(api) {
        api.addStyle(
            ".bc-censor-blur{filter:blur(7px);transition:filter .12s ease;border-radius:4px}" +
            ".bc-censor-blur.bc-reveal{cursor:pointer}" +
            ".bc-censor-blur.bc-reveal:hover{filter:blur(0)}" +
            ".bc-censor-hide{display:none!important}");

        let cache = { key: null, re: null };
        const matcher = () => {
            const key = JSON.stringify([api.settings.get("words", ""), api.settings.get("caseSensitive", false), api.settings.get("wholeWord", true)]);
            if (key === cache.key) return cache.re;
            cache.key = key;
            const words = String(api.settings.get("words", "")).split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
            if (!words.length) { cache.re = null; return null; }
            const whole = api.settings.get("wholeWord", true);
            const parts = words.map(w => { const e = w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); return whole ? "\\b" + e + "\\b" : e; });
            try { cache.re = new RegExp("(" + parts.join("|") + ")", api.settings.get("caseSensitive", false) ? "" : "i"); } catch { cache.re = null; }
            return cache.re;
        };

        const CONTENT = '[id^="message-content-"], [class*="messageContent"]';
        const scan = () => {
            const re = matcher();
            const hover = api.settings.get("reveal", true);
            const hide = api.settings.get("mode", "blur") === "hide";
            for (const el of document.querySelectorAll(CONTENT)) {
                const hit = !!re && re.test(el.textContent || "");
                const row = (el.closest('li, [class*="message_"]')) || el;
                el.classList.toggle("bc-censor-blur", hit && !hide);
                el.classList.toggle("bc-reveal", hit && !hide && hover);
                row.classList.toggle("bc-censor-hide", hit && hide);
            }
        };
        api.dom.observe(scan, { throttle: 300 });

        // reset marks when the plugin is turned off
        api.cleanup(() => {
            for (const el of document.querySelectorAll(".bc-censor-blur")) el.classList.remove("bc-censor-blur", "bc-reveal");
            for (const el of document.querySelectorAll(".bc-censor-hide")) el.classList.remove("bc-censor-hide");
        });
    },

    options(api) {
        const set = (k, v) => api.settings.set(k, v);
        return [
            api.ui.note("One word or phrase per line (or comma-separated). Matching messages are blurred (hover to reveal) or hidden. Visual only — nothing is sent or changed for others."),
            api.ui.textarea(api.settings.get("words", ""), v => set("words", v), "e.g.\nmy street address\nreal name\nproject-codename"),
            api.ui.row("Mode", api.ui.select([["blur", "Blur (reveal on hover)"], ["hide", "Hide the whole message"]], api.settings.get("mode", "blur"), v => set("mode", v))),
            api.ui.row("Reveal blurred messages on hover", api.ui.toggle(api.settings.get("reveal", true), v => set("reveal", v))),
            api.ui.row("Match whole words only", api.ui.toggle(api.settings.get("wholeWord", true), v => set("wholeWord", v))),
            api.ui.row("Case sensitive", api.ui.toggle(api.settings.get("caseSensitive", false), v => set("caseSensitive", v)))
        ];
    }
});
