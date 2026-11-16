// Read Aloud: Alt+click a message to have your computer read it out loud (local text-to-speech, nothing leaves your PC).
(window.beecord || window.blxstncord).definePlugin({
    id: "read-aloud",
    name: "Read Aloud",
    description: "Alt+click any message to hear it read with your system voice (offline text-to-speech).",
    author: "beecord",
    version: "1.0.0",
    category: "Tools",
    enabledByDefault: false,
    webpack: false,

    start(api) {
        if (!window.speechSynthesis) { api.log("speechSynthesis not available"); return; }
        const synth = window.speechSynthesis;
        api.cleanup(() => { try { synth.cancel(); } catch { } });

        const clean = t => t.replace(/<a?:(\w+):\d+>/g, "$1").replace(/<@[!&]?\d+>/g, "").replace(/<#\d+>/g, "")
            .replace(/https?:\/\/\S+/g, "link").replace(/\|\|/g, "").replace(/[*_~`>]/g, "").trim();

        api.on(document, "click", e => {
            if (!e.altKey) return;
            const li = e.target.closest && e.target.closest('li[id^="chat-messages-"]');
            if (!li) return;
            const content = li.querySelector('[id^="message-content-"]');
            const text = clean((content ? content.textContent : li.textContent) || "");
            if (!text) return;
            e.preventDefault(); e.stopPropagation();
            if (synth.speaking) { synth.cancel(); return; } // Alt+click again to stop
            const u = new SpeechSynthesisUtterance(text.slice(0, 600));
            u.rate = Number(api.settings.get("rate", 1)) || 1;
            u.pitch = Number(api.settings.get("pitch", 1)) || 1;
            const vn = api.settings.get("voice", "");
            if (vn) { const v = synth.getVoices().find(x => x.name === vn); if (v) u.voice = v; }
            synth.speak(u);
        }, true);
    },

    options(api) {
        const voices = window.speechSynthesis ? window.speechSynthesis.getVoices() : [];
        const opts = [["", "Default voice"], ...voices.map(v => [v.name, v.name + " (" + v.lang + ")"])];
        return [
            api.ui.row("Voice", api.ui.select(opts, api.settings.get("voice", ""), v => api.settings.set("voice", v))),
            api.ui.row("Speed", api.ui.input(api.settings.get("rate", 1), v => api.settings.set("rate", Math.min(2, Math.max(0.5, v || 1))), "1", "number")),
            api.ui.note("Alt+click a message to read it. Alt+click again (or while it talks) to stop. If the voice list is empty, open this once more after Discord finishes loading.")
        ];
    }
});
