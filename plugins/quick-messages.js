// Quick Messages: save canned messages and drop them into the chat box with a hotkey picker (Ctrl+Shift+Q).
// Inserts into the box so you can still edit before sending.
(window.beecord || window.blxstncord).definePlugin({
    id: "quick-messages",
    name: "Quick Messages",
    description: "Save canned messages and insert them with Ctrl+Shift+Q (a quick picker, press 1-9 to pick). Great for common replies.",
    author: "beecord",
    version: "1.0.0",
    category: "Tools",
    enabledByDefault: false,
    webpack: false,

    start(api) {
        const h = api.ui.h;
        const list = () => { const v = api.settings.get("messages", []); return Array.isArray(v) ? v : []; };
        if (!api.settings.get("messages", null)) api.settings.set("messages", [
            { title: "Greeting", text: "hey! what's up?" },
            { title: "BRB", text: "brb, back in a few minutes" }
        ]);

        const editor = () => document.querySelector('[role="textbox"][data-slate-editor="true"]');
        const insert = text => {
            const box = editor();
            if (!box) { api.toast("Open a chat first", "#e8c478", 2000); return; }
            box.focus();
            try {
                const dt = new DataTransfer();
                dt.setData("text/plain", text);
                box.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
            } catch (e) { api.log("insert failed: " + (e && e.message || e)); }
        };

        let menu = null;
        const close = () => { if (menu) { menu.remove(); menu = null; } };
        api.on(document, "click", e => { if (menu && !menu.contains(e.target)) close(); }, true);

        const open = () => {
            close();
            const msgs = list();
            menu = h("div", { id: "beecord-qm" });
            menu.style.cssText = "position:fixed;left:50%;bottom:90px;transform:translateX(-50%);z-index:100001;width:min(420px,90vw);max-height:50vh;overflow:auto;" +
                "padding:6px;border-radius:10px;background:var(--ig-popup,#141414);border:1px solid var(--ig-border,#202020);box-shadow:0 10px 40px rgba(0,0,0,.55);" +
                "font:500 13px var(--ig-font,ui-monospace,monospace);color:#dbdee1";
            menu.append(h("div", { style: "padding:4px 8px 8px;font-size:10.5px;font-weight:700;letter-spacing:.04em;color:var(--ig-accent,#9dbfea);text-transform:uppercase" }, "Quick messages"));
            if (!msgs.length) menu.append(h("div", { style: "padding:8px;color:#949ba4;font-size:12px" }, "No saved messages. Add some in the plugin settings."));
            msgs.forEach((m, i) => {
                const row = h("div", { style: "display:flex;gap:10px;align-items:baseline;padding:8px;border-radius:6px;cursor:pointer" },
                    h("b", { style: "flex:none;color:var(--ig-accent,#9dbfea);min-width:16px" }, String(i + 1)),
                    h("div", { style: "flex:1;min-width:0" },
                        h("div", { style: "color:#f2f3f5;font-weight:600" }, m.title || "Message"),
                        h("div", { style: "color:#949ba4;font-size:11.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" }, (m.text || "").replace(/\s+/g, " "))));
                row.addEventListener("mouseenter", () => row.style.background = "rgba(157,191,234,.14)");
                row.addEventListener("mouseleave", () => row.style.background = "");
                row.addEventListener("click", () => { close(); insert(m.text || ""); });
                menu.append(row);
            });
            document.body.append(menu);
        };

        api.on(window, "keydown", e => {
            if (e.ctrlKey && e.shiftKey && !e.altKey && e.key.toLowerCase() === "q") { e.preventDefault(); e.stopPropagation(); menu ? close() : open(); return; }
            if (menu && /^[1-9]$/.test(e.key)) { const m = list()[Number(e.key) - 1]; if (m) { e.preventDefault(); close(); insert(m.text || ""); } }
            if (menu && e.key === "Escape") { e.preventDefault(); close(); }
        }, true);
        api.cleanup(close);
    },

    options(api) {
        const h = api.ui.h;
        const get = () => { const v = api.settings.get("messages", []); return Array.isArray(v) ? v : []; };
        const view = h("div");
        const draw = () => {
            const msgs = get();
            const rows = msgs.map((m, i) => {
                const title = api.ui.input(m.title || "", v => { msgs[i].title = v; api.settings.set("messages", msgs); }, "Title");
                title.style.width = "130px";
                const text = api.ui.textarea(m.text || "", v => { msgs[i].text = v; api.settings.set("messages", msgs); }, "Message text");
                text.style.minHeight = "44px";
                const del = h("button", { type: "button", class: "fc-btn sec", style: "height:28px;align-self:flex-start" }, "Remove");
                del.addEventListener("click", () => { msgs.splice(i, 1); api.settings.set("messages", msgs); draw(); });
                return h("div", { style: "display:flex;gap:8px;align-items:flex-start;padding:8px 0;border-bottom:1px solid var(--ig-child-border,#161616)" },
                    h("div", { style: "display:flex;flex-direction:column;gap:6px;flex:1" }, title, text), del);
            });
            const add = h("button", { type: "button", class: "fc-btn", style: "height:30px;margin-top:8px" }, "+ Add message");
            add.addEventListener("click", () => { msgs.push({ title: "New", text: "" }); api.settings.set("messages", msgs); draw(); });
            view.replaceChildren(api.ui.note("Press Ctrl+Shift+Q in any chat to open the picker (1-9 inserts that message)."), ...rows, add);
        };
        draw();
        return [view];
    }
});
