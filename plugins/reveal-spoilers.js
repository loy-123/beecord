// Reveal Spoilers: reveal spoilers by just hovering them, or show them all automatically (your view only).
(window.beecord || window.blxstncord).definePlugin({
    id: "reveal-spoilers",
    name: "Reveal Spoilers",
    description: "Reveal spoilers on hover instead of clicking, or show them all at once. Only affects what you see.",
    author: "beecord",
    version: "1.0.0",
    category: "Look",
    enabledByDefault: false,
    webpack: false,

    start(api) {
        const build = () => {
            const mode = api.settings.get("mode", "hover");
            if (mode === "all") return `[class*="spoilerContent"], [class*="spoilerContainer"]{opacity:1!important}
                [class*="spoilerContent"] [class*="hidden"], [class*="spoiler"][class*="hidden"]{filter:none!important}
                [class*="spoilerWarning"]{display:none!important}
                span[class*="spoilerText"], [class*="inlineContent"]{background:transparent!important;color:inherit!important}`;
            return `span[class*="spoilerText"]:hover, [class*="spoilerContent"]:hover{background:transparent!important}
                [class*="spoilerContent"]:hover [class*="hidden"]{filter:none!important}
                [class*="spoilerContent"]:hover [class*="spoilerWarning"]{display:none!important}`;
        };
        let style = api.addStyle(build());
        this.__refresh = () => { style.textContent = build(); };
    },

    options(api) {
        return [
            api.ui.row("Spoilers", api.ui.select([["hover", "Reveal on hover"], ["all", "Always show"]], api.settings.get("mode", "hover"), v => { api.settings.set("mode", v); if (this.__refresh) this.__refresh(); })),
            api.ui.note("This only changes your own view; it doesn't tell anyone you revealed a spoiler.")
        ];
    }
});
