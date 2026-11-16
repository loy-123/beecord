// No Link Embeds: links you send don't get a big preview card (SUPPRESS_EMBEDS = 1 << 2).
(window.beecord || window.blxstncord).definePlugin({
    id: "no-embeds",
    name: "No Link Embeds",
    description: "Links in your messages are sent without the preview card. Start a message with @embed to keep the preview.",
    author: "beecord",
    version: "1.0.0",
    enabledByDefault: false,
    webpack: false,

    start(api) {
        const SUPPRESS = 1 << 2;
        api.messages.onSend((msg, ctx) => {
            if (ctx.edit || typeof msg.content !== "string") return;
            if (/^@embed\s/i.test(msg.content)) {
                msg.content = msg.content.replace(/^@embed\s+/i, "");
                return msg;
            }
            const links = (msg.content.match(/https?:\/\/\S+/gi) || []).length;
            if (links < Math.max(1, Number(api.settings.get("min", 1)) || 1)) return;
            msg.flags = (Number(msg.flags) || 0) | SUPPRESS;
            return msg;
        }, 50);
    },

    options(api) {
        return [
            api.ui.row("Only when the message has at least this many links",
                api.ui.input(api.settings.get("min", 1), v => api.settings.set("min", Math.max(1, Math.round(v) || 1)), "1", "number")),
            api.ui.note("Start a message with \"@embed \" to keep the preview for that one message.")
        ];
    }
});
