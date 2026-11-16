// Keyword Tracker: get a personal notification when one of your words shows up in any channel,
// like a private @mention. Matches are listed in the Logs tab.
(window.beecord || window.blxstncord).definePlugin({
    id: "keyword-tracker",
    name: "Keyword Tracker",
    description: "Notifies you when your chosen words appear in any channel (a personal highlight). Matches show in the Logs tab.",
    author: "beecord",
    version: "1.0.0",
    category: "Tools",
    enabledByDefault: false,
    webpack: true,

    start(api) {
        const UserStore = api.stores.get("UserStore");
        const ChannelStore = api.stores.get("ChannelStore");
        const GuildStore = api.stores.get("GuildStore");
        const SelectedChannel = api.stores.get("SelectedChannelStore");
        if (!UserStore || !api.flux.get()) return false;

        const entries = this.__entries = [];
        const words = () => String(api.settings.get("words", "")).split(/\r?\n|,/).map(w => w.trim()).filter(w => w.length >= 2);
        const makeRe = () => { const w = words(); if (!w.length) return null; return new RegExp("(?:^|\\W)(" + w.map(x => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")(?:\\W|$)", "i"); };
        let re = makeRe();
        this.__rebuild = () => { re = makeRe(); };

        const beep = () => { try { const a = new (window.AudioContext || window.webkitAudioContext)(); const o = a.createOscillator(), g = a.createGain(); o.connect(g); g.connect(a.destination); o.frequency.value = 1050; g.gain.setValueAtTime(0.0001, a.currentTime); g.gain.exponentialRampToValueAtTime(0.18, a.currentTime + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + 0.3); o.start(); o.stop(a.currentTime + 0.3); setTimeout(() => a.close().catch(() => { }), 500); } catch { } };

        api.logs.register({
            title: "Keyword Tracker",
            list: () => entries.slice(),
            remove: id => { const i = entries.findIndex(e => e.id === id); if (i >= 0) entries.splice(i, 1); },
            clear: () => { entries.length = 0; }
        });

        api.flux.subscribe("MESSAGE_CREATE", payload => {
            try {
                if (!re) return;
                const msg = payload.message; if (!msg || !msg.content) return;
                const me = UserStore.getCurrentUser && UserStore.getCurrentUser();
                if (me && msg.author && msg.author.id === me.id) return;        // not your own messages
                if (msg.author && msg.author.bot && api.settings.get("skipBots", true)) return;
                const focused = SelectedChannel && SelectedChannel.getChannelId && SelectedChannel.getChannelId();
                if (api.settings.get("onlyAway", true) && focused === msg.channel_id && document.hasFocus()) return; // you're already looking
                const mt = re.exec(msg.content); if (!mt) return;
                let where = "";
                try { const ch = ChannelStore && ChannelStore.getChannel(msg.channel_id); if (ch) { const g = ch.guild_id && GuildStore && GuildStore.getGuild(ch.guild_id); where = (g ? g.name + " #" + (ch.name || "") : (ch.name ? "#" + ch.name : "DM")); } } catch { }
                const name = (msg.author && (msg.author.global_name || msg.author.username)) || "Unknown";
                entries.unshift({ id: msg.id, category: "general", kind: "keyword", tag: "KEYWORD: " + mt[1], name, where, author: msg.author && msg.author.id, text: msg.content.slice(0, 500), content: msg.content.slice(0, 500), ts: Date.now() });
                if (entries.length > 300) entries.pop();
                if (api.settings.get("toast", true)) api.toast("🔔 " + name + (where ? " in " + where : "") + ": " + msg.content.slice(0, 80), "#9dbfea", 6000);
                if (api.settings.get("sound", true)) beep();
                api.logs.refresh();
            } catch (e) { api.log("keyword error: " + (e && e.message || e)); }
        });
        return true;
    },

    options(api) {
        return [
            api.ui.note("Words to watch for (one per line or comma separated, at least 2 letters):"),
            api.ui.textarea(api.settings.get("words", ""), v => { api.settings.set("words", v); if (this.__rebuild) this.__rebuild(); }, "my name\nproject deadline\nraid"),
            api.ui.row("Pop-up notice", api.ui.toggle(api.settings.get("toast", true), v => api.settings.set("toast", v))),
            api.ui.row("Sound", api.ui.toggle(api.settings.get("sound", true), v => api.settings.set("sound", v))),
            api.ui.row("Only when I'm not looking at that channel", api.ui.toggle(api.settings.get("onlyAway", true), v => api.settings.set("onlyAway", v))),
            api.ui.row("Ignore bots", api.ui.toggle(api.settings.get("skipBots", true), v => api.settings.set("skipBots", v))),
            api.ui.note("Matches are also saved in the Logs tab.")
        ];
    }
});
