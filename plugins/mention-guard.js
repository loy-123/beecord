// Mention Guard: asks before sending a message that would ping a lot of people (@everyone, @here, many users/roles).
(window.beecord || window.blxstncord).definePlugin({
    id: "mention-guard",
    name: "Mention Guard",
    description: "Asks for confirmation before you send a message with @everyone, @here, role pings or many user pings.",
    author: "beecord",
    version: "1.0.0",
    enabledByDefault: true,
    webpack: false,

    start(api) {
        api.messages.onSend(async (msg, ctx) => {
            if (ctx.edit || typeof msg.content !== "string") return;
            // ignore mentions inside code
            const text = msg.content.replace(/```[\s\S]*?```|`[^`\n]*`/g, "");
            const parse = msg.allowed_mentions && Array.isArray(msg.allowed_mentions.parse) ? msg.allowed_mentions.parse : null;
            const reasons = [];
            const mass = text.match(/@(everyone|here)\b/g);
            if (mass && api.settings.get("mass", true) && (!parse || parse.includes("everyone"))) reasons.push([...new Set(mass)].join(" and "));
            const roles = new Set(text.match(/<@&\d+>/g) || []);
            if (roles.size && api.settings.get("roles", true)) reasons.push(roles.size + " role ping" + (roles.size > 1 ? "s" : ""));
            const users = new Set(text.match(/<@!?\d+>/g) || []);
            const max = Number(api.settings.get("users", 5)) || 5;
            if (users.size >= max) reasons.push(users.size + " user pings");
            if (!reasons.length) return;
            const ok = await api.ui.confirm("Ping " + reasons.join(", ") + "?",
                "This message will notify: " + reasons.join(", ") + ".\n\n" + msg.content.slice(0, 300) + (msg.content.length > 300 ? "…" : ""),
                "Send", "Don't send");
            if (!ok) api.toast("Not sent.", "#4e5058", 2500);
            return ok ? msg : false;
        }, 80);
    },

    options(api) {
        return [
            api.ui.row("Ask before @everyone / @here", api.ui.toggle(api.settings.get("mass", true), v => api.settings.set("mass", v))),
            api.ui.row("Ask before role pings", api.ui.toggle(api.settings.get("roles", true), v => api.settings.set("roles", v))),
            api.ui.row("Ask when pinging at least this many users",
                api.ui.input(api.settings.get("users", 5), v => api.settings.set("users", Math.max(2, Math.round(v) || 5)), "5", "number")),
            api.ui.note("In the dialog: Enter = send, Esc = don't send.")
        ];
    }
});
