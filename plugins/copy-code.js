// Copy Code: a "Copy" button on code blocks in messages.
// The button floats above the page (it is not inserted into Discord's React tree), so it can't break rendering.
(window.beecord || window.blxstncord).definePlugin({
    id: "copy-code",
    name: "Copy Code",
    description: "Hover a code block in chat to get a Copy button that copies the whole block.",
    author: "beecord",
    version: "1.0.0",
    enabledByDefault: true,
    webpack: false,

    start(api) {
        const { h } = api.ui;
        const btn = h("button", { type: "button", "aria-label": "Copy code" }, "Copy");
        btn.style.cssText = "position:fixed;z-index:9999;display:none;height:22px;padding:0 9px;border:1px solid #262626;border-radius:4px;" +
            "background:#181818;color:#aab1bd;font:600 11px var(--ig-font,ui-monospace,monospace);cursor:pointer";
        document.body.append(btn);
        api.cleanup(() => btn.remove());
        let current = null, hideT = null;

        const place = pre => {
            const r = pre.getBoundingClientRect();
            if (r.bottom < 0 || r.top > innerHeight) { hide(); return; }
            btn.style.top = Math.max(r.top + 6, 4) + "px";
            btn.style.left = (r.right - btn.offsetWidth - 8) + "px";
        };
        const show = pre => {
            clearTimeout(hideT);
            if (current !== pre) { current = pre; btn.textContent = "Copy"; }
            btn.style.display = "block";
            place(pre);
        };
        const hide = () => { btn.style.display = "none"; current = null; };

        api.on(document, "mouseover", e => {
            const t = e.target;
            if (!t || !t.closest) return;
            if (t === btn) { clearTimeout(hideT); return; }
            const pre = t.closest('[id^="message-content-"] pre, [id^="message-accessories-"] pre, [class*="markup"] pre');
            if (pre && pre.querySelector("code")) show(pre);
            else if (current) { clearTimeout(hideT); hideT = setTimeout(hide, 150); }
        }, true);
        api.on(document, "scroll", () => { if (current) { if (current.isConnected) place(current); else hide(); } }, true);

        btn.addEventListener("click", async () => {
            if (!current) return;
            const code = current.querySelector("code");
            const text = (code ? code.innerText : current.innerText).replace(/\n$/, "");
            let ok = false;
            try { await navigator.clipboard.writeText(text); ok = true; }
            catch {
                try { const ta = h("textarea"); ta.value = text; document.body.append(ta); ta.select(); ok = document.execCommand("copy"); ta.remove(); } catch { }
            }
            btn.textContent = ok ? "Copied!" : "Failed";
            setTimeout(() => { if (btn.textContent !== "Copy") btn.textContent = "Copy"; }, 1500);
        });
    }
});
