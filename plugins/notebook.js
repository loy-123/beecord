// Notebook: a personal popup (Ctrl+Shift+N) with three tabs — Notes (a scratchpad), Tasks (a checklist),
// and Saved (snippets you keep). Everything is stored locally in beecord's settings; nothing is sent.
// Ctrl+Shift+Y saves the currently selected text straight into Saved.
(window.beecord || window.blxstncord).definePlugin({
    id: "notebook",
    name: "Notebook",
    description: "Personal notes, a task checklist, and saved snippets in one popup (Ctrl+Shift+N). Ctrl+Shift+Y saves the selected text. Local only.",
    author: "beecord",
    version: "1.0.0",
    category: "Tools",
    enabledByDefault: false,
    webpack: false,

    start(api) {
        const h = api.ui.h;
        const getArr = k => { const v = api.settings.get(k, []); return Array.isArray(v) ? v : []; };
        let wrap = null, tab = "notes", body = null;

        const close = () => { if (wrap) { wrap.remove(); wrap = null; body = null; } };
        const esc = s => String(s == null ? "" : s);

        const mkBtn = (label, fn, sec) => { const b = h("button", { type: "button" }, label); b.style.cssText = "height:28px;padding:0 12px;border:0;border-radius:7px;cursor:pointer;font:700 11.5px var(--ig-font,monospace);white-space:nowrap;" + (sec ? "background:#181818;color:#aab1bd;box-shadow:inset 0 0 0 1px #262626" : "background:var(--ig-accent,#9dbfea);color:#0c1016"); b.addEventListener("click", fn); return b; };
        const iconBtn = (sym, title, fn) => { const b = h("button", { type: "button", title }, sym); b.style.cssText = "width:24px;height:24px;flex:none;border:0;border-radius:6px;cursor:pointer;background:transparent;color:#949ba4;font:700 13px var(--ig-font,monospace)"; b.addEventListener("mouseenter", () => { b.style.background = "rgba(255,255,255,.08)"; b.style.color = "#f2f3f5"; }); b.addEventListener("mouseleave", () => { b.style.background = "transparent"; b.style.color = "#949ba4"; }); b.addEventListener("click", fn); return b; };

        const renderNotes = () => {
            const ta = h("textarea", { spellcheck: "false", placeholder: "Jot anything here… (saved automatically)" });
            ta.value = esc(api.settings.get("notes", ""));
            ta.style.cssText = "width:100%;height:100%;min-height:300px;resize:none;box-sizing:border-box;padding:10px;border-radius:8px;border:1px solid var(--ig-border,#202020);background:rgba(0,0,0,.25);color:#dbdee1;font:400 12.5px/1.5 var(--ig-font,ui-monospace,monospace);outline:none";
            ta.addEventListener("input", () => api.settings.set("notes", ta.value));
            ta.addEventListener("keydown", e => e.stopPropagation());
            body.replaceChildren(ta);
            setTimeout(() => ta.focus(), 0);
        };

        const renderTasks = () => {
            const tasks = getArr("tasks");
            const input = h("input", { placeholder: "Add a task and press Enter" });
            input.style.cssText = "flex:1;height:32px;padding:0 10px;box-sizing:border-box;border-radius:8px;border:1px solid var(--ig-border,#202020);background:rgba(0,0,0,.25);color:#dbdee1;font:inherit;outline:none";
            input.addEventListener("keydown", e => {
                e.stopPropagation();
                if (e.key === "Enter" && input.value.trim()) { tasks.unshift({ text: input.value.trim(), done: false }); api.settings.set("tasks", tasks); renderTasks(); }
            });
            const addRow = h("div", { style: "display:flex;gap:8px;margin-bottom:10px" }, input, mkBtn("Add", () => { if (input.value.trim()) { tasks.unshift({ text: input.value.trim(), done: false }); api.settings.set("tasks", tasks); renderTasks(); } }));
            const list = h("div", { style: "display:flex;flex-direction:column;gap:4px;overflow:auto" });
            if (!tasks.length) list.append(h("div", { style: "padding:14px;text-align:center;color:#949ba4;font-size:12px" }, "No tasks yet."));
            tasks.forEach((t, i) => {
                const box = h("div", { style: "width:17px;height:17px;flex:none;border-radius:5px;cursor:pointer;border:1.5px solid " + (t.done ? "var(--ig-accent,#9dbfea)" : "#555b66") + ";background:" + (t.done ? "var(--ig-accent,#9dbfea)" : "transparent") + ";display:flex;align-items:center;justify-content:center;color:#0c1016;font:800 11px var(--ig-font,monospace)" }, t.done ? "✓" : "");
                box.addEventListener("click", () => { tasks[i].done = !tasks[i].done; api.settings.set("tasks", tasks); renderTasks(); });
                const row = h("div", { style: "display:flex;align-items:center;gap:10px;padding:7px 8px;border-radius:7px;background:rgba(255,255,255,.025)" },
                    box,
                    h("span", { style: "flex:1;min-width:0;word-break:break-word;font-size:12.5px;color:" + (t.done ? "#6c7280" : "#dbdee1") + ";text-decoration:" + (t.done ? "line-through" : "none") }, esc(t.text)),
                    iconBtn("×", "Delete", () => { tasks.splice(i, 1); api.settings.set("tasks", tasks); renderTasks(); }));
                list.append(row);
            });
            const foot = tasks.some(t => t.done) ? h("div", { style: "margin-top:8px" }, mkBtn("Clear done", () => { api.settings.set("tasks", tasks.filter(t => !t.done)); renderTasks(); }, true)) : null;
            body.replaceChildren(addRow, list, foot || h("span"));
        };

        const addSaved = text => {
            text = String(text || "").trim();
            if (!text) { api.toast("Nothing selected", "#e8c478", 1600); return false; }
            const saved = getArr("saved");
            saved.unshift({ text: text.slice(0, 4000), at: Date.now() });
            api.settings.set("saved", saved.slice(0, 200));
            return true;
        };
        const renderSaved = () => {
            const saved = getArr("saved");
            const head = h("div", { style: "display:flex;gap:8px;margin-bottom:10px;align-items:center" },
                h("div", { style: "flex:1;font-size:11px;color:#949ba4" }, saved.length + " saved · Ctrl+Shift+Y saves selection"),
                mkBtn("Save selection", () => { const sel = String(window.getSelection() || ""); if (addSaved(sel)) renderSaved(); }));
            const list = h("div", { style: "display:flex;flex-direction:column;gap:6px;overflow:auto" });
            if (!saved.length) list.append(h("div", { style: "padding:14px;text-align:center;color:#949ba4;font-size:12px" }, "Nothing saved. Select text anywhere and press Ctrl+Shift+Y, or use the button."));
            saved.forEach((s, i) => {
                const card = h("div", { style: "padding:8px 10px;border-radius:8px;background:rgba(255,255,255,.028);border:1px solid var(--ig-border,#1c1c1c)" },
                    h("div", { style: "font-size:12px;color:#dbdee1;white-space:pre-wrap;word-break:break-word;max-height:84px;overflow:auto" }, esc(s.text)),
                    h("div", { style: "display:flex;align-items:center;gap:6px;margin-top:6px" },
                        h("span", { style: "flex:1;font-size:10px;color:#6c7280" }, new Date(s.at || Date.now()).toLocaleString()),
                        iconBtn("⧉", "Copy", async () => { try { await navigator.clipboard.writeText(s.text); api.toast("Copied", "#80d09c", 1200); } catch { } }),
                        iconBtn("×", "Delete", () => { saved.splice(i, 1); api.settings.set("saved", saved); renderSaved(); })));
                list.append(card);
            });
            body.replaceChildren(head, list);
        };

        const renderTab = () => { tab === "tasks" ? renderTasks() : tab === "saved" ? renderSaved() : renderNotes(); };
        const open = () => {
            close();
            wrap = h("div", { id: "beecord-notebook" });
            wrap.style.cssText = "position:fixed;right:24px;bottom:24px;z-index:100001;width:min(420px,92vw);height:min(520px,80vh);display:flex;flex-direction:column;" +
                "padding:12px;border-radius:14px;background:var(--ig-popup,#141414);border:1px solid var(--ig-border,#202020);box-shadow:0 18px 60px rgba(0,0,0,.6);" +
                "font:500 13px var(--ig-font,ui-monospace,monospace);color:#dbdee1";
            const bar = h("div", { style: "display:flex;gap:4px;flex:1" });
            const refreshBar = () => {
                bar.replaceChildren();
                [["notes", "Notes"], ["tasks", "Tasks"], ["saved", "Saved"]].forEach(([id, label]) => {
                    const b = h("div", { style: "padding:5px 11px;border-radius:7px;cursor:pointer;font-size:12px;font-weight:600;" + (tab === id ? "background:rgba(157,191,234,.16);color:var(--ig-accent,#9dbfea)" : "color:#949ba4") }, label);
                    b.addEventListener("click", () => { tab = id; refreshBar(); renderTab(); });
                    bar.append(b);
                });
            };
            refreshBar();
            const header = h("div", { style: "display:flex;align-items:center;gap:8px;margin-bottom:10px" }, bar, iconBtn("×", "Close", close));
            body = h("div", { style: "flex:1;min-height:0;display:flex;flex-direction:column" });
            wrap.append(header, body);
            document.body.append(wrap);
            renderTab();
        };

        api.on(window, "keydown", e => {
            if (e.ctrlKey && e.shiftKey && !e.altKey && e.key.toLowerCase() === "n") { e.preventDefault(); e.stopPropagation(); wrap ? close() : open(); return; }
            if (e.ctrlKey && e.shiftKey && !e.altKey && e.key.toLowerCase() === "y") {
                e.preventDefault(); e.stopPropagation();
                const sel = String(window.getSelection() || "");
                if (addSaved(sel)) { api.toast("Saved to Notebook", "#80d09c", 1400); if (wrap && tab === "saved") renderTab(); }
            }
            if (wrap && e.key === "Escape" && !e.ctrlKey) { e.preventDefault(); close(); }
        }, true);
        api.cleanup(close);
    },

    options(api) {
        return [api.ui.note("Ctrl+Shift+N opens the Notebook (Notes · Tasks · Saved). Ctrl+Shift+Y saves whatever text you've selected into Saved. Everything is stored locally in beecord.")];
    }
});
