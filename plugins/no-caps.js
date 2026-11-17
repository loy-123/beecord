// No Caps: if you fire off a MESSAGE THAT'S MOSTLY SHOUTING, it's quietly toned down to normal case
// before sending. Start a message with @caps to keep it loud.
(window.beecord || window.blxstncord).definePlugin({
    id: "no-caps",
    name: "No Caps",
    description: "Tones down messages that are mostly UPPERCASE to normal case before sending. Begin with @caps to keep it loud.",
    author: "beecord",
    version: "1.0.0",
    category: "Chat",
    enabledByDefault: false,
    webpack: false,

    start(api) {
        api.messages.onSend((msg, ctx) => {
            if (ctx.edit || typeof msg.content !== "string") return;
            if (/^@caps\s/i.test(msg.content)) { msg.content = msg.content.replace(/^@caps\s+/i, ""); return msg; }
            // measure only the parts that aren't code / mentions / links / emoji
            const bare = msg.content.replace(/```[\s\S]*?```|`[^`\n]*`|<a?:\w+:\d+>|<@[!&]?\d+>|<#\d+>|https?:\/\/\S+/g, "");
            const letters = bare.replace(/[^a-zA-Z]/g, "");
            if (letters.length < Math.max(5, Number(api.settings.get("minLetters", 6)) || 6)) return;
            const upper = (bare.match(/[A-Z]/g) || []).length;
            const ratio = upper / letters.length;
            if (ratio < (Number(api.settings.get("threshold", 60)) || 60) / 100) return;
            // lower-case everything except inside code/mentions/links/emoji; optionally capitalise sentence starts
            const sentence = api.settings.get("sentence", true);
            msg.content = msg.content.split(/(```[\s\S]*?```|`[^`\n]*`|<a?:\w+:\d+>|<@[!&]?\d+>|<#\d+>|https?:\/\/\S+)/).map((part, i) => {
                if (i % 2) return part;
                let t = part.toLowerCase();
                if (sentence) t = t.replace(/(^\s*|[.!?]\s+)([a-z])/g, (m, pre, c) => pre + c.toUpperCase());
                return t;
            }).join("");
            this.__n = (this.__n || 0) + 1;
            return msg;
        }, 25);
    },

    options(api) {
        return [
            api.ui.row("Shout threshold (% uppercase)", api.ui.input(api.settings.get("threshold", 60), v => api.settings.set("threshold", Math.min(100, Math.max(30, Math.round(v) || 60))), "60", "number")),
            api.ui.row("Capitalise the start of sentences", api.ui.toggle(api.settings.get("sentence", true), v => api.settings.set("sentence", v))),
            api.ui.note("Toned down " + (this.__n || 0) + " message(s) this session. Start a message with “@caps ” to send it fully uppercase.")
        ];
    }
});
