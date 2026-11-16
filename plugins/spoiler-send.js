// Spoiler Send: start a message with ;spoiler (or ;sp) to wrap the whole thing in ||spoilers||.
(window.beecord || window.blxstncord).definePlugin({
    id: "spoiler-send",
    name: "Spoiler Send",
    description: "Start a message with ;spoiler (or ;sp) to send it hidden behind a spoiler.",
    author: "beecord",
    version: "1.0.0",
    category: "Chat",
    enabledByDefault: false,
    webpack: false,

    start(api) {
        api.messages.onSend(msg => {
            if (typeof msg.content !== "string") return;
            const m = /^;(spoiler|sp)[ \n]/i.exec(msg.content);
            if (!m) return;
            let rest = msg.content.slice(m[0].length).trim();
            if (!rest) return;
            rest = rest.replace(/\|\|/g, "​|​|​"); // don't let existing || close early
            msg.content = "||" + rest + "||";
            return msg;
        }, 16);
    },

    options(api) {
        return [api.ui.note("Example: “;spoiler the ending is sad” is sent as ||the ending is sad||.")];
    }
});
