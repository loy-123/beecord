// Image Tools: hover an image in chat to get Copy / Save / Open buttons, and scroll to zoom the full-size view.
(window.beecord || window.blxstncord).definePlugin({
    id: "image-tools",
    name: "Image Tools",
    description: "Hover a chat image for Copy / Save / Open buttons, and scroll on the full-size image to zoom.",
    author: "beecord",
    version: "1.0.0",
    category: "Tools",
    enabledByDefault: false,
    webpack: false,

    start(api) {
        const { h } = api.ui;
        // ----- hover toolbar on message images -----
        const bar = h("div", { id: "beecord-imgtools" });
        bar.style.cssText = "position:fixed;z-index:9999;display:none;gap:3px;padding:3px;border-radius:8px;background:rgba(10,10,10,.85);border:1px solid var(--ig-border,#202020)";
        const mk = (label, fn) => { const b = h("button", { type: "button", style: "all:unset;cursor:pointer;padding:3px 8px;border-radius:5px;color:#dbdee1;font:600 11px var(--ig-font,ui-monospace,monospace)" }, label); b.addEventListener("mouseenter", () => b.style.background = "rgba(255,255,255,.1)"); b.addEventListener("mouseleave", () => b.style.background = ""); b.addEventListener("click", e => { e.stopPropagation(); e.preventDefault(); fn(); }); return b; };
        let curSrc = "";
        const fullSrc = s => s.replace(/([?&])(width|height|size)=\d+/g, "$1").replace(/[?&]$/, "");
        const copyBtn = mk("Copy", async () => {
            try { const r = await fetch(curSrc); const blob = await r.blob(); await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]); api.toast("Image copied", "#80d09c", 1800); }
            catch { try { await navigator.clipboard.writeText(curSrc); api.toast("Copied image link", "#80d09c", 1800); } catch { api.toast("Couldn't copy", "#e88080", 2000); } }
        });
        const saveBtn = mk("Save", () => { const a = document.createElement("a"); a.href = curSrc; a.download = (curSrc.split("/").pop() || "image").split("?")[0]; document.body.append(a); a.click(); a.remove(); });
        const openBtn = mk("Open", () => { try { window.open(curSrc, "_blank"); } catch { } });
        bar.append(copyBtn, saveBtn, openBtn);
        document.body.append(bar);
        api.cleanup(() => bar.remove());
        let hideT = null;
        const hide = () => { bar.style.display = "none"; };
        api.on(document, "mouseover", e => {
            const t = e.target;
            if (t === bar || (t.closest && t.closest("#beecord-imgtools"))) { clearTimeout(hideT); return; }
            const img = t.closest && t.closest('li[id^="chat-messages-"] img[src*="cdn.discordapp"], [class*="imageWrapper"] img, [class*="imageContainer"] img');
            if (img && img.closest && !img.closest("#blxstncord-panel") && img.naturalWidth > 40) {
                curSrc = fullSrc(img.currentSrc || img.src);
                const r = img.getBoundingClientRect();
                bar.style.display = "flex";
                bar.style.left = Math.max(8, r.right - (bar.offsetWidth || 150) - 6) + "px";
                bar.style.top = Math.max(8, r.top + 6) + "px";
                clearTimeout(hideT);
            } else if (bar.style.display !== "none") { clearTimeout(hideT); hideT = setTimeout(hide, 200); }
        }, true);
        api.on(document, "scroll", hide, true);

        // ----- scroll-to-zoom on the opened (lightbox) image -----
        if (api.settings.get("zoom", true)) {
            api.on(document, "wheel", e => {
                const img = e.target.closest && e.target.closest('[class*="imageWrapper"] img, [class*="modal"] img, [aria-label="Image"] img, img[class*="lazyImg"]');
                if (!img || !img.closest('[class*="modal"],[class*="layer"],[class*="focusLock"]')) return;
                e.preventDefault();
                const cur = Number(img.__bcZoom || 1);
                const next = Math.min(8, Math.max(1, cur * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
                img.__bcZoom = next;
                img.style.transform = "scale(" + next + ")";
                img.style.transition = "transform .08s";
                img.style.cursor = next > 1 ? "zoom-out" : "zoom-in";
            }, { passive: false });
        }
    },

    options(api) {
        return [
            api.ui.row("Scroll to zoom the full-size image", api.ui.toggle(api.settings.get("zoom", true), v => api.settings.set("zoom", v))),
            api.ui.note("Hover an image in chat for Copy / Save / Open. Open an image, then scroll to zoom in and out.")
        ];
    }
});
