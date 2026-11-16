// Copy Message: Alt+click a message to copy its full text to the clipboard (handy on long messages).
(window.beecord || window.blxstncord).definePlugin({
    id: "copy-message",
    name: "Copy Message",
    description: "Alt+click a message to copy its full text. (Read Aloud, if on, uses Alt+click too — pick one.)",
    author: "beecord",
    version: "1.0.0",
    category: "Tools",
    enabledByDefault: false,
    webpack: true,

    start(api) {
        const MessageStore = api.stores.get("MessageStore");
        api.on(document, "click", async e => {
            if (!e.altKey || e.shiftKey || e.ctrlKey) return;
            const li = e.target.closest && e.target.closest('li[id^="chat-messages-"]');
            if (!li) return;
            if (e.target.closest('a,button,[role="button"],img,video')) return;
            const m = /chat-messages-(\d+)-(\d+)/.exec(li.id);
            let text = "";
            if (m && MessageStore) { try { const msg = MessageStore.getMessage(m[1], m[2]); text = msg && msg.content; } catch { } }
            if (!text) { const c = li.querySelector('[id^="message-content-"]'); text = c ? c.textContent : ""; }
            if (!text) return;
            e.preventDefault(); e.stopPropagation();
            let ok = false;
            try { await navigator.clipboard.writeText(text); ok = true; } catch { }
            api.toast(ok ? "Message copied" : "Couldn't copy", ok ? "#80d09c" : "#e88080", 1600);
        }, true);
        return true;
    },

    options(api) {
        return [api.ui.note("Alt+click a message to copy its text. If you also use Read Aloud (also Alt+click), keep only one of them on.")];
    }
});
