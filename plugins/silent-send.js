// Silent Send: sends your messages as @silent (no push/desktop notification for the people you message).
// Same flag Discord uses for "@silent" messages (SUPPRESS_NOTIFICATIONS = 1 << 12).
(window.beecord || window.blxstncord).definePlugin({
    id: "silent-send",
    name: "Silent Send",
    description: "Sends messages as @silent so they don't trigger notifications. Start a message with @loud to notify normally.",
    author: "beecord",
    version: "1.0.0",
    enabledByDefault: false,
    webpack: false,

    start(api) {
        const SILENT = 1 << 12;
        api.messages.onSend((msg, ctx) => {
            if (ctx.edit) return;
            if (typeof msg.content === "string" && /^@loud\s/i.test(msg.content)) {
                msg.content = msg.content.replace(/^@loud\s+/i, "");
                return msg;
            }
            const where = api.settings.get("where", "all");
            const isDm = /^\/channels\/@me\//.test(location.pathname);
            if (where === "dms" && !isDm) return;
            if (where === "servers" && isDm) return;
            msg.flags = (Number(msg.flags) || 0) | SILENT;
            return msg;
        }, 50);
    },

    options(api) {
        return [
            api.ui.row("Send silently in", api.ui.select([["all", "DMs and servers"], ["servers", "Servers only"], ["dms", "DMs only"]],
                api.settings.get("where", "all"), v => api.settings.set("where", v))),
            api.ui.note("Start a message with \"@loud \" to send that one normally (the prefix is removed).")
        ];
    }
});
