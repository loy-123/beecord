// Highlight Mentions: makes messages that ping you (or reply to you) stand out more, with an accent bar.
// Purely local styling.
(window.beecord || window.blxstncord).definePlugin({
    id: "highlight-mentions",
    name: "Highlight Mentions",
    description: "Gives messages that mention you a clearer accent bar and glow so you don't miss them.",
    author: "beecord",
    version: "1.0.0",
    category: "Look",
    enabledByDefault: true,
    webpack: false,

    start(api) {
        const color = () => api.settings.get("color", "#9dbfea");
        const strong = () => api.settings.get("strong", true);
        const build = () => `
            li[id^="chat-messages-"][class*="mentioned"]{
                background: color-mix(in srgb, ${color()} ${strong() ? 11 : 7}%, transparent) !important;
                box-shadow: inset 3px 0 0 ${color()} !important;
            }
            li[id^="chat-messages-"][class*="mentioned"]::before{ background: ${color()} !important; }
            ${strong() ? `li[id^="chat-messages-"][class*="mentioned"]:hover{ background: color-mix(in srgb, ${color()} 16%, transparent) !important; }` : ""}`;
        let style = api.addStyle(build());
        this.__refresh = () => { style.textContent = build(); };
    },

    options(api) {
        const re = () => { if (this.__refresh) this.__refresh(); };
        const colors = [["#9dbfea", "Blue"], ["#f2a9bc", "Pink"], ["#80d09c", "Green"], ["#e8c478", "Amber"], ["#c9a9f2", "Purple"], ["#f28b82", "Red"]];
        return [
            api.ui.row("Accent color", api.ui.select(colors, api.settings.get("color", "#9dbfea"), v => { api.settings.set("color", v); re(); })),
            api.ui.row("Stronger highlight", api.ui.toggle(api.settings.get("strong", true), v => { api.settings.set("strong", v); re(); })),
            api.ui.note("Applies to messages that @mention you, @everyone/@here, or reply to you — whatever Discord marks as a mention.")
        ];
    }
});
