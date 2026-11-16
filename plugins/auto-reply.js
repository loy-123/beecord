// Away Auto-Reply: when you switch on "Away", beecord sends ONE automatic reply (clearly from you) to people
// who DM you, so they know you're not around. It never pretends to be anyone else and never hides that you're away.
//  - Off by default; you must turn Away on each time (it does not auto-enable).
//  - Replies at most once per person while Away, DMs only unless you allow mentions.
(window.beecord || window.blxstncord).definePlugin({
    id: "auto-reply",
    name: "Away Auto-Reply",
    description: "While you turn on “Away”, sends one automatic “I'm away” reply to people who DM you. Off until you enable Away.",
    author: "beecord",
    version: "1.0.0",
    category: "Tools",
    enabledByDefault: false,
    webpack: true,

    start(api) {
        const MessageActions = api.webpack.findByProps(["sendMessage", "editMessage"], "sendMessage");
        const UserStore = api.stores.get("UserStore");
        const ChannelStore = api.stores.get("ChannelStore");
        if (!MessageActions || !UserStore || !api.flux.get()) return false;

        const repliedAt = new Map(); // channelId -> time
        const COOLDOWN = 10 * 60 * 1000;
        this.__away = () => !!api.settings.get("away", false);
        this.__toggle = () => { api.settings.set("away", !this.__away()); if (this.__draw) this.__draw(); api.toast(this.__away() ? "Away auto-reply is ON" : "Away auto-reply is OFF", this.__away() ? "#e8c478" : "#4e5058"); };

        const rnd = () => "" + Date.now() + Math.floor(Math.random() * 1000);
        api.flux.subscribe("MESSAGE_CREATE", payload => {
            try {
                if (!api.settings.get("away", false)) return;
                const msg = payload.message; if (!msg || !msg.author) return;
                const me = UserStore.getCurrentUser && UserStore.getCurrentUser();
                if (!me || msg.author.id === me.id || msg.author.bot) return;
                const ch = ChannelStore && ChannelStore.getChannel(msg.channel_id);
                const isDM = ch && (ch.type === 1 || ch.type === 3);
                const mentionsMe = Array.isArray(msg.mentions) && msg.mentions.some(u => u && u.id === me.id);
                if (!isDM && !(mentionsMe && api.settings.get("mentions", false))) return;
                const last = repliedAt.get(msg.channel_id) || 0;
                if (Date.now() - last < COOLDOWN) return;
                repliedAt.set(msg.channel_id, Date.now());
                const text = (api.settings.get("message", "") || "I'm away right now — I'll reply when I'm back. (automatic)").slice(0, 300);
                setTimeout(() => { try { MessageActions.sendMessage(msg.channel_id, { content: text, tts: false, invalidEmojis: [], validNonShortcutEmojis: [] }, void 0, { nonce: rnd() }); this.__n = (this.__n || 0) + 1; } catch (e) { api.log("auto-reply send failed: " + (e && e.message || e)); } }, 800 + Math.random() * 1200);
            } catch (e) { api.log("auto-reply error: " + (e && e.message || e)); }
        });
        return true;
    },

    options(api) {
        const { h } = api.ui;
        const view = h("div");
        this.__draw = () => {
            const away = !!api.settings.get("away", false);
            const toggleBtn = h("button", { type: "button", class: "fc-btn" + (away ? "" : " sec"), style: "height:30px" }, away ? "Away: ON — turn off" : "Away: OFF — turn on");
            toggleBtn.addEventListener("click", () => { if (this.__toggle) this.__toggle(); });
            view.replaceChildren(
                h("div", { style: "display:flex;align-items:center;gap:10px;margin-bottom:8px" }, toggleBtn, h("span", { style: "font-size:11.5px;color:var(--ig-secondary,#646b78)" }, away ? "Auto-replying to DMs." : "No auto-replies are sent.")),
                api.ui.note("Your away message (sent once per person while Away; “(automatic)” makes clear it isn't you typing):"),
                api.ui.textarea(api.settings.get("message", ""), v => api.settings.set("message", v), "I'm away right now — I'll reply when I'm back. (automatic)"),
                api.ui.row("Also reply to @mentions in servers", api.ui.toggle(api.settings.get("mentions", false), v => api.settings.set("mentions", v))),
                api.ui.note("Sent this session: " + (this.__n || 0) + ". Away turns itself off when you disable the plugin or restart Discord.")
            );
        };
        this.__draw();
        return [view];
    },

    stop(api) { try { api.settings.set("away", false); } catch { } }
});
