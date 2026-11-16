// Undo Send: holds each message for a few seconds with an "Undo" button, like Gmail.
// An undone message is never sent to Discord. Its grey "sending" copy is removed from the chat and
// (optionally) the text is put back in the message box so you can fix it.
// Note: the core answers a cancelled send with HTTP 400 and remembers its nonce, so Discord's automatic
// retry can't sneak the message through (that was why undo used to fail).
(window.beecord || window.blxstncord).definePlugin({
    id: "undo-send",
    name: "Undo Send",
    description: "Waits a few seconds before a message is really sent and shows an Undo button (or press Esc / Ctrl+Z) to stop it.",
    author: "beecord",
    version: "1.1.0",
    enabledByDefault: false,
    webpack: false,

    start(api) {
        const { h } = api.ui;
        const pending = [];
        const bar = h("div", { id: "beecord-undo" });
        bar.style.cssText = "position:fixed;left:50%;bottom:92px;transform:translateX(-50%);z-index:100000;display:none;flex-direction:column;gap:6px;align-items:center";
        document.body.append(bar);
        api.cleanup(() => { for (const p of [...pending]) p.send(); bar.remove(); });

        const editor = () => document.querySelector('[role="textbox"][data-slate-editor="true"]');
        const boxEmpty = () => { const b = editor(); return !b || !(b.innerText || "").replace(/[﻿​\s]/g, ""); };
        const restore = text => {
            if (!text || !api.settings.get("restore", true)) return;
            setTimeout(() => {
                const box = editor();
                if (!box || !boxEmpty()) return;
                box.focus();
                try {
                    const dt = new DataTransfer();
                    dt.setData("text/plain", text);
                    box.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
                } catch (e) { api.log("restore failed: " + (e && e.message || e)); }
            }, 120);
        };
        const undoLast = () => { const p = pending[pending.length - 1]; if (p) { p.cancel(); return true; } return false; };
        api.on(window, "keydown", e => {
            if (!pending.length || e.repeat) return;
            const isUndo = e.key === "Escape" || ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "z");
            if (!isUndo || !boxEmpty()) return; // while typing, Esc / Ctrl+Z keep their normal meaning
            if (undoLast()) { e.preventDefault(); e.stopImmediatePropagation(); }
        }, true);

        api.messages.onSend((msg, ctx) => {
            if (ctx.edit) return;
            const secs = Math.min(30, Math.max(1, Number(api.settings.get("seconds", 5)) || 5));
            const typed = ctx.originalContent || (typeof msg.content === "string" ? msg.content : "");
            return new Promise(resolve => {
                const started = Date.now();
                let timer = null, settled = false;
                const label = h("span", { class: "bc-undo-label" });
                const undo = h("button", { type: "button", class: "bc-undo-btn" }, "Undo");
                const barFill = h("i", { class: "bc-undo-fill" });
                const card = h("div", { class: "bc-undo-card" }, label, undo, barFill);
                const preview = String(typed || (msg.attachments && msg.attachments.length ? "[attachment]" : "")).replace(/\s+/g, " ").slice(0, 60);
                const draw = () => {
                    const left = Math.max(0, secs * 1000 - (Date.now() - started));
                    label.textContent = "Sending in " + Math.ceil(left / 1000) + "s" + (preview ? " · " + preview : "");
                    barFill.style.width = (100 * left / (secs * 1000)) + "%";
                    if (left <= 0) p.send();
                };
                const end = () => {
                    settled = true;
                    clearInterval(timer);
                    card.remove();
                    const i = pending.indexOf(p); if (i >= 0) pending.splice(i, 1);
                    if (!pending.length) bar.style.display = "none";
                };
                const p = {
                    send: () => { if (settled) return; end(); resolve(msg); },
                    cancel: () => { if (settled) return; end(); resolve(false); api.toast("Message not sent", "#4e5058", 1800); restore(typed); }
                };
                undo.addEventListener("click", p.cancel);
                pending.push(p);
                bar.append(card);
                bar.style.display = "flex";
                draw();
                timer = setInterval(draw, 100);
            });
        }, 90);

        api.addStyle(`
            #beecord-undo .bc-undo-card{position:relative;display:flex;align-items:center;gap:14px;padding:8px 8px 10px 14px;overflow:hidden;max-width:560px;
                border-radius:var(--ig-r-card,10px);border:1px solid var(--ig-border,#202020);background:var(--ig-panel,#111);color:var(--ig-bright,#e8ecf2);
                font:500 12.5px var(--ig-font,"JetBrains Mono",ui-monospace,monospace);box-shadow:0 6px 24px rgba(0,0,0,.45)}
            #beecord-undo .bc-undo-label{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
            #beecord-undo .bc-undo-btn{height:24px;padding:0 12px;border:0;border-radius:var(--ig-r,6px);cursor:pointer;
                background:var(--ig-accent,#9dbfea);color:#0c0c0c;font:700 12px var(--ig-font,"JetBrains Mono",ui-monospace,monospace)}
            #beecord-undo .bc-undo-btn:hover{filter:brightness(1.1)}
            #beecord-undo .bc-undo-fill{position:absolute;left:0;bottom:0;height:2px;background:var(--ig-accent,#9dbfea);transition:width .1s linear}`);
    },

    options(api) {
        return [
            api.ui.row("Delay (seconds)", api.ui.input(api.settings.get("seconds", 5), v => api.settings.set("seconds", Math.min(30, Math.max(1, Math.round(v) || 5))), "5", "number")),
            api.ui.row("Put the text back in the message box after Undo", api.ui.toggle(api.settings.get("restore", true), v => api.settings.set("restore", v))),
            api.ui.note("Undo with the button, or press Esc / Ctrl+Z while the message box is empty.")
        ];
    }
});
