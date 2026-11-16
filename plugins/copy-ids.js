// Copy IDs: copy message and user IDs without turning on Developer Mode.
//   Alt+Shift+Click a message  -> copies the message ID
//   Alt+Shift+Click an avatar   -> copies that user's ID
(window.beecord || window.blxstncord).definePlugin({
    id: "copy-ids",
    name: "Copy IDs",
    description: "Alt+Shift+Click a message to copy its ID, or an avatar to copy the user ID — no Developer Mode needed.",
    author: "beecord",
    version: "1.0.0",
    category: "Tools",
    enabledByDefault: false,
    webpack: true,

    start(api) {
        const messages = api.stores.get("MessageStore");
        const copy = async (text, what) => {
            let ok = false;
            try { await navigator.clipboard.writeText(text); ok = true; } catch { }
            api.toast(ok ? what + " ID copied: " + text : "Couldn't copy", ok ? "#80d09c" : "#e88080", 2000);
        };
        api.on(document, "click", e => {
            if (!e.altKey || !e.shiftKey) return;
            const li = e.target.closest && e.target.closest('li[id^="chat-messages-"]');
            if (!li) return;
            const m = /chat-messages-(\d+)-(\d+)/.exec(li.id);
            if (!m) return;
            e.preventDefault(); e.stopPropagation();
            const avatar = e.target.closest('img[class*="avatar"], [class*="avatar"]');
            if (avatar) {
                const src = (avatar.querySelector && avatar.querySelector("img") || avatar).src || "";
                const um = /\/avatars\/(\d+)\//.exec(src) || /\/users\/(\d+)/.exec(src);
                let uid = um && um[1];
                if (!uid && messages) { try { const msg = messages.getMessage(m[1], m[2]); uid = msg && msg.author && msg.author.id; } catch { } }
                if (uid) return copy(uid, "User");
            }
            copy(m[2], "Message");
        }, true);
        return true;
    },

    options(api) {
        return [api.ui.note("Alt+Shift+Click a message copies its ID. Alt+Shift+Click an avatar copies the user ID. Works without Developer Mode.")];
    }
});
