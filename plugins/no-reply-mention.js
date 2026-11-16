// No Reply Mention: replies no longer ping the person you reply to (the "@ ON" switch is turned off for you).
(window.beecord || window.blxstncord).definePlugin({
    id: "no-reply-mention",
    name: "No Reply Mention",
    description: "Your replies don't ping the author of the original message. Start a reply with @ping to ping anyway.",
    author: "beecord",
    version: "1.0.0",
    enabledByDefault: false,
    webpack: false,

    start(api) {
        api.messages.onSend((msg, ctx) => {
            if (ctx.edit || !msg.message_reference) return;
            if (typeof msg.content === "string" && /^@ping\s/i.test(msg.content)) {
                msg.content = msg.content.replace(/^@ping\s+/i, "");
                return msg;
            }
            const am = msg.allowed_mentions && typeof msg.allowed_mentions === "object" ? msg.allowed_mentions : { parse: ["users", "roles", "everyone"] };
            am.replied_user = false;
            msg.allowed_mentions = am;
            return msg;
        }, 50);
    },

    options(api) {
        return [api.ui.note("Tip: begin a reply with \"@ping \" to ping that one time (the prefix is removed).")];
    }
});
