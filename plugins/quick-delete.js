// Quick Delete: hold Shift and click one of YOUR messages to delete it instantly (no menu).
// Only ever deletes your own messages. Uses Discord's own delete action (no token handling).
(window.beecord || window.blxstncord).definePlugin({
    id: "quick-delete",
    name: "Quick Delete",
    description: "Shift+click your own message to delete it right away — only your messages, through Discord's normal delete.",
    author: "beecord",
    version: "1.0.0",
    category: "Chat",
    enabledByDefault: false,
    webpack: true,

    start(api) {
        const MessageActions = api.webpack.findByProps(["deleteMessage", "editMessage"], "deleteMessage");
        const UserStore = api.stores.get("UserStore");
        const MessageStore = api.stores.get("MessageStore");
        if (!MessageActions || !UserStore || !MessageStore) return false;

        api.on(document, "click", async e => {
            if (!e.shiftKey || e.altKey || e.ctrlKey) return;
            const li = e.target.closest && e.target.closest('li[id^="chat-messages-"]');
            if (!li) return;
            // don't fire on links, buttons, images, the reactions row, or selected text
            if (e.target.closest('a,button,[role="button"],img,video,[class*="reaction"]')) return;
            if (window.getSelection && String(window.getSelection())) return;
            const m = /chat-messages-(\d+)-(\d+)/.exec(li.id);
            if (!m) return;
            let msg; try { msg = MessageStore.getMessage(m[1], m[2]); } catch { }
            const me = UserStore.getCurrentUser && UserStore.getCurrentUser();
            if (!msg || !me || !msg.author || msg.author.id !== me.id) return; // only your own
            e.preventDefault(); e.stopPropagation();
            if (api.settings.get("confirm", false)) {
                const ok = await api.ui.confirm("Delete this message?", (msg.content || "[no text]").slice(0, 200), "Delete", "Keep");
                if (!ok) return;
            }
            try { MessageActions.deleteMessage(m[1], m[2]); this.__n = (this.__n || 0) + 1; }
            catch (err) { api.toast("Couldn't delete: " + (err && err.message || err), "#e88080", 3000); }
        }, true);
        return true;
    },

    options(api) {
        return [
            api.ui.row("Ask before deleting", api.ui.toggle(api.settings.get("confirm", false), v => api.settings.set("confirm", v))),
            api.ui.note("Shift+click your own message to delete it. Deleted this session: " + (this.__n || 0) + ".")
        ];
    }
});
