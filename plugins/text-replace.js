// Text Replace: your own find -> replace rules, applied to messages you send (and edit).
// Rules, one per line:   shrug => ¯\_(ツ)_/¯      or a regex:   /\bteh\b/gi => the
(window.beecord || window.blxstncord).definePlugin({
    id: "text-replace",
    name: "Text Replace",
    description: "Your own find → replace rules (text or /regex/) applied to messages before they are sent. Great for shortcuts and typo fixes.",
    author: "beecord",
    version: "1.0.0",
    enabledByDefault: false,
    webpack: false,

    start(api) {
        // ";word" triggers: ":shrug:" style would not work, Discord turns :shrug: into an emoji before sending
        const DEFAULT = ";shrug => ¯\\\\_(ツ)_/¯\n;flip => (╯°□°)╯︵ ┻━┻\n;unflip => ┬─┬ノ( º _ ºノ)\n;lenny => ( ͡° ͜ʖ ͡°)";
        if (api.settings.get("rules", null) === null) api.settings.set("rules", DEFAULT);

        const parse = text => {
            const out = [];
            for (const line of String(text || "").split(/\r?\n/)) {
                const i = line.indexOf("=>");
                if (i <= 0 || /^\s*#/.test(line)) continue;
                const from = line.slice(0, i).trim(), to = line.slice(i + 2).trim().replace(/\\n/g, "\n");
                if (!from) continue;
                const re = /^\/(.+)\/([gimsuy]*)$/.exec(from);
                if (re) { try { out.push({ re: new RegExp(re[1], re[2].includes("g") ? re[2] : re[2] + "g"), to }); } catch { } }
                else out.push({ re: new RegExp(from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"), to: to.replace(/\$/g, "$$$$") });
            }
            return out;
        };
        api.messages.onSend((msg, ctx) => {
            if (typeof msg.content !== "string" || !msg.content) return;
            if (ctx.edit && !api.settings.get("edits", true)) return;
            const rules = parse(api.settings.get("rules", ""));
            if (!rules.length) return;
            // leave `code` and ```code blocks``` alone
            msg.content = msg.content.split(/(```[\s\S]*?```|`[^`\n]*`)/).map((part, i) => {
                if (i % 2) return part;
                for (const r of rules) part = part.replace(r.re, r.to);
                return part;
            }).join("");
            return msg;
        }, 10);
    },

    options(api) {
        return [
            api.ui.textarea(api.settings.get("rules", ""), v => api.settings.set("rules", v), "find => replace   (one rule per line, /regex/flags allowed, # comments)"),
            api.ui.row("Also apply when editing a message", api.ui.toggle(api.settings.get("edits", true), v => api.settings.set("edits", v))),
            api.ui.note("Plain rules match exact text. Regex rules can use $1 etc. Write \\n for a new line. Text inside `code` is never changed.")
        ];
    }
});
