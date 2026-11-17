// Performance Mode: makes Discord lighter by turning off the eye-candy that costs the most CPU/GPU —
// animations, transitions, background effects and blurs. Pure CSS, instant on/off.
(window.beecord || window.blxstncord).definePlugin({
    id: "performance-mode",
    name: "Performance Mode",
    description: "Cuts Discord's animations, transitions and blur effects so the app runs lighter and smoother.",
    author: "beecord",
    version: "1.0.0",
    category: "Tools",
    enabledByDefault: false,
    webpack: false,

    start(api) {
        let style = api.addStyle("");
        const build = () => {
            const css = [];
            if (api.settings.get("anim", true)) css.push(
                "*,*::before,*::after{animation-duration:.001s!important;animation-delay:0s!important;transition-duration:.001s!important;transition-delay:0s!important}");
            if (api.settings.get("blur", true)) css.push(
                "*{backdrop-filter:none!important;-webkit-backdrop-filter:none!important}");
            if (api.settings.get("shadows", false)) css.push(
                "*{box-shadow:none!important;text-shadow:none!important}");
            if (api.settings.get("effects", false)) css.push(
                // decorations that repaint a lot: avatar decorations, nameplates, profile effects
                '[class*="avatarDecoration"],[class*="nameplate"],[class*="profileEffects"],[class*="banner"] video,[class*="clan"] img{display:none!important}');
            if (api.settings.get("emojiStatic", false)) css.push(
                'img[class*="emoji"],img[data-type="emoji"]{image-rendering:auto}'); // (GIF freezing lives in the Pause GIFs plugin)
            style.textContent = css.join("\n");
        };
        build();
        this.__refresh = build;
    },

    options(api) {
        const re = () => { if (this.__refresh) this.__refresh(); };
        return [
            api.ui.row("Disable animations & transitions", api.ui.toggle(api.settings.get("anim", true), v => { api.settings.set("anim", v); re(); })),
            api.ui.row("Disable blur effects (backdrop-filter)", api.ui.toggle(api.settings.get("blur", true), v => { api.settings.set("blur", v); re(); })),
            api.ui.row("Disable shadows", api.ui.toggle(api.settings.get("shadows", false), v => { api.settings.set("shadows", v); re(); })),
            api.ui.row("Hide heavy decorations (avatar frames, nameplates, profile effects)", api.ui.toggle(api.settings.get("effects", false), v => { api.settings.set("effects", v); re(); })),
            api.ui.note("For animated GIFs, also turn on the “Pause GIFs” plugin. Changes apply instantly.")
        ];
    }
});
