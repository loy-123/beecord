// Privacy Blur: blurs private things on screen (for screen sharing, streaming or people behind you).
// Hover something to see it. Ctrl+Shift+B toggles the blur.
// Panic key Ctrl+Shift+X: blurs everything (no hover reveal), pauses media and, if chosen, minimizes Discord.
(window.beecord || window.blxstncord).definePlugin({
    id: "privacy-blur",
    name: "Privacy Blur",
    description: "Blurs messages, names, avatars, DMs and servers for screen sharing (hover to reveal). Ctrl+Shift+B toggles, Ctrl+Shift+X is a panic key.",
    author: "beecord",
    version: "1.0.0",
    enabledByDefault: true,
    webpack: false,

    start(api) {
        const PARTS = {
            messages: ['li[id^="chat-messages-"] [id^="message-content-"]', 'li[id^="chat-messages-"] [id^="message-accessories-"]',
                'li[id^="chat-messages-"] [class*="repliedTextPreview"]'],
            names: ['li[id^="chat-messages-"] h3 [class*="username"]', 'li[id^="chat-messages-"] [class*="repliedMessage"] [class*="username"]',
                '[class*="members"] [class*="name"]', '[class*="typing"] strong'],
            avatars: ['li[id^="chat-messages-"] img[class*="avatar"]', '[class*="members"] [class*="avatar"]', '[class*="privateChannels"] [class*="avatar"]'],
            dms: ['[class*="privateChannels"] [class*="name"]', '[class*="privateChannels"] [class*="subText"]', '[class*="privateChannels"] [class*="activity"]'],
            servers: ['[data-list-item-id^="guildsnav___"] img', '[data-list-item-id^="guildsnav___"] [class*="acronym"]',
                '[class*="sidebar"] header [class*="name"]', '[class*="sidebar"] [class*="channel"] [class*="name"]', 'section[class*="title"] h1'],
            self: ['[class*="panels"] [class*="nameTag"]', '[class*="panels"] [class*="avatar"]', '[class*="panels"] [class*="panelTitleContainer"]']
        };
        const LABELS = { messages: "Messages", names: "User names", avatars: "Avatars", dms: "DM list", servers: "Servers & channels", self: "Your own name & avatar" };
        this.__labels = LABELS;
        const root = document.documentElement;
        let style = null;
        const build = () => {
            const amount = Math.min(20, Math.max(2, Number(api.settings.get("amount", 7)) || 7));
            const hover = api.settings.get("hover", true);
            let css = "";
            for (const [k, sels] of Object.entries(PARTS)) {
                if (!api.settings.get("p_" + k, k !== "self")) continue;
                const on = sels.map(s => "html.bc-blur " + s).join(",");
                const panic = sels.map(s => "html.bc-panic " + s).join(",");
                css += on + "{filter:blur(" + amount + "px)!important;transition:filter .15s ease}\n";
                if (hover) css += sels.map(s => "html.bc-blur:not(.bc-panic) " + s + ":hover").join(",") + "{filter:none!important}\n";
                css += panic + "{filter:blur(" + (amount * 2) + "px)!important}\n";
            }
            css += "html.bc-panic img, html.bc-panic video, html.bc-panic [id^='message-content-']{filter:blur(" + (amount * 2) + "px)!important}\n";
            if (style) style.textContent = css; else style = api.addStyle(css);
        };
        build();
        this.__rebuild = build;

        const setBlur = v => { root.classList.toggle("bc-blur", v); api.settings.set("on", v); };
        setBlur(!!api.settings.get("on", false));
        api.cleanup(() => { root.classList.remove("bc-blur", "bc-panic"); this.__rebuild = null; });

        api.on(document, "keydown", e => {
            if (!e.ctrlKey || !e.shiftKey || e.altKey) return;
            const k = e.key.toLowerCase();
            if (k === "b") {
                e.preventDefault(); e.stopPropagation();
                if (root.classList.contains("bc-panic")) { root.classList.remove("bc-panic"); setBlur(false); api.toast("Privacy blur: OFF", "#4e5058"); return; }
                const v = !root.classList.contains("bc-blur");
                setBlur(v);
                api.toast(v ? "Privacy blur: ON (hover to reveal)" : "Privacy blur: OFF", v ? "#5865f2" : "#4e5058");
            } else if (k === "x") {
                e.preventDefault(); e.stopPropagation();
                if (root.classList.contains("bc-panic")) { root.classList.remove("bc-panic"); api.toast("Panic mode off (blur stays on, Ctrl+Shift+B to remove)", "#4e5058", 3000); return; }
                root.classList.add("bc-panic", "bc-blur");
                for (const m of document.querySelectorAll("video, audio")) { try { if (!m.paused) m.pause(); } catch { } }
                if (api.settings.get("panicMin", true)) api.command("window:minimize");
            }
        }, true);
    },

    options(api) {
        const L = this.__labels || {};
        const re = () => { if (this.__rebuild) this.__rebuild(); };
        return [
            api.ui.row("Blur is on now (Ctrl+Shift+B)", api.ui.toggle(document.documentElement.classList.contains("bc-blur"), v => {
                document.documentElement.classList.toggle("bc-blur", v); api.settings.set("on", v);
            })),
            ...Object.entries(L).map(([k, label]) => api.ui.row("Blur: " + label, api.ui.toggle(api.settings.get("p_" + k, k !== "self"), v => { api.settings.set("p_" + k, v); re(); }))),
            api.ui.row("Reveal on hover", api.ui.toggle(api.settings.get("hover", true), v => { api.settings.set("hover", v); re(); })),
            api.ui.row("Blur strength (px)", api.ui.input(api.settings.get("amount", 7), v => { api.settings.set("amount", v); re(); }, "7", "number")),
            api.ui.row("Panic key (Ctrl+Shift+X) also minimizes Discord", api.ui.toggle(api.settings.get("panicMin", true), v => api.settings.set("panicMin", v))),
            api.ui.note("Panic key: blurs everything without hover reveal and pauses all media. Press Ctrl+Shift+X again to leave panic mode, Ctrl+Shift+B to remove the blur.")
        ];
    }
});
