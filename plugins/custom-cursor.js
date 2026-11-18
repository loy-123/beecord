// Custom Cursor: replace the mouse cursor while you're over Discord. Static styles use plain CSS; animated
// built-ins, your own image/GIF, and imported .ani/.cur files hide the real pointer and draw a follower
// element (CSS cursors can't animate). Only affects the Discord window; normal everywhere else.
(window.beecord || window.blxstncord).definePlugin({
    id: "custom-cursor",
    name: "Custom Cursor",
    description: "Give Discord its own cursor: static styles, animated built-ins, your image/GIF, or an imported .ani/.cur file. Only affects Discord.",
    author: "beecord",
    version: "3.0.0",
    category: "Look",
    enabledByDefault: false,
    webpack: false,

    start(api) {
        const STATIC = {
            dot: { hx: 8, hy: 8, svg: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><circle cx="8" cy="8" r="5" fill="#9dbfea" stroke="#0c0c0c" stroke-width="1.5"/></svg>' },
            ring: { hx: 10, hy: 10, svg: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><circle cx="10" cy="10" r="7" fill="rgba(157,191,234,.15)" stroke="#9dbfea" stroke-width="2"/></svg>' },
            "arrow-blue": { hx: 3, hy: 2, svg: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><path d="M3 2 L3 20 L8 15 L11 22 L14.5 20.5 L11.5 13.5 L18 13.5 Z" fill="#9dbfea" stroke="#0c0c0c" stroke-width="1" stroke-linejoin="round"/></svg>' },
            "arrow-white": { hx: 3, hy: 2, svg: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><path d="M3 2 L3 20 L8 15 L11 22 L14.5 20.5 L11.5 13.5 L18 13.5 Z" fill="#f2f3f5" stroke="#000" stroke-width="1" stroke-linejoin="round"/></svg>' },
            "arrow-pink": { hx: 3, hy: 2, svg: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><path d="M3 2 L3 20 L8 15 L11 22 L14.5 20.5 L11.5 13.5 L18 13.5 Z" fill="#f2a9bc" stroke="#0c0c0c" stroke-width="1" stroke-linejoin="round"/></svg>' },
            crosshair: { hx: 11, hy: 11, svg: '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22"><path d="M11 1 V21 M1 11 H21" stroke="#9dbfea" stroke-width="2"/><circle cx="11" cy="11" r="2" fill="#9dbfea"/></svg>' }
        };
        const ANIM = {
            pulse: '<div style="width:14px;height:14px;border-radius:50%;background:#9dbfea;box-shadow:0 0 8px #9dbfea;animation:bc-cur-pulse 1.1s ease-in-out infinite"></div>',
            "ring-spin": '<div style="width:22px;height:22px;border-radius:50%;border:2px solid rgba(157,191,234,.28);border-top-color:#9dbfea;animation:bc-cur-spin .9s linear infinite"></div>',
            rainbow: '<div style="width:14px;height:14px;border-radius:50%;background:#ff4d4d;box-shadow:0 0 8px rgba(255,255,255,.4);animation:bc-cur-hue 3s linear infinite"></div>',
            glow: '<div style="width:26px;height:26px;border-radius:50%;background:radial-gradient(circle,rgba(157,191,234,.9),rgba(157,191,234,0) 70%);animation:bc-cur-breathe 1.6s ease-in-out infinite"></div>'
        };

        const cssStyle = api.addStyle("");
        api.addStyle(
            "@keyframes bc-cur-pulse{0%,100%{transform:scale(1);opacity:.95}50%{transform:scale(1.6);opacity:.45}}" +
            "@keyframes bc-cur-spin{to{transform:rotate(360deg)}}" +
            "@keyframes bc-cur-hue{to{filter:hue-rotate(360deg)}}" +
            "@keyframes bc-cur-breathe{0%,100%{transform:scale(1);opacity:.85}50%{transform:scale(1.45);opacity:.4}}");

        // ---------- follower engine ----------
        let follower = null, raf = 0, frameTimer = 0, mx = -300, my = -300, fx = -300, fy = -300, kick = null;
        const stopFollower = () => { if (follower) { follower.remove(); follower = null; } if (raf) { cancelAnimationFrame(raf); raf = 0; } if (frameTimer) { clearTimeout(frameTimer); frameTimer = 0; } kick = null; };
        api.cleanup(stopFollower);
        api.on(window, "mousemove", e => { mx = e.clientX; my = e.clientY; if (follower) { follower.style.opacity = "1"; if (kick) kick(); } }, true);
        api.on(document, "mouseleave", () => { if (follower) follower.style.opacity = "0"; }, true);

        const mkFollower = () => {
            stopFollower();
            follower = document.createElement("div");
            follower.id = "beecord-cursor";
            follower.style.cssText = "position:fixed;left:0;top:0;pointer-events:none;z-index:2147483647;opacity:0;will-change:transform";
            document.body.append(follower);
            fx = mx; fy = my;
        };
        const runLoop = (hx, hy, centered) => {
            const place = () => {
                follower.style.transform = centered
                    ? "translate(" + fx + "px," + fy + "px) translate(-50%,-50%)"
                    : "translate(" + Math.round(fx - hx) + "px," + Math.round(fy - hy) + "px)";
            };
            const loop = () => {
                if (!follower) { raf = 0; return; }
                const s = Math.min(0.92, Math.max(0, (Number(api.settings.get("smooth", 0)) || 0) / 100));
                const k = s ? 1 - s : 1;
                fx += (mx - fx) * k; fy += (my - fy) * k;
                place();
                // Stop once we've caught up to the pointer; mousemove re-kicks the loop. This keeps the
                // follower buttery at the display's refresh rate while moving, and uses 0 frames while idle.
                if (Math.abs(mx - fx) < 0.25 && Math.abs(my - fy) < 0.25) { fx = mx; fy = my; place(); raf = 0; return; }
                raf = requestAnimationFrame(loop);
            };
            kick = () => { if (!raf && follower) raf = requestAnimationFrame(loop); };
            kick();
        };
        const startHtml = (html, hx, hy, centered) => {
            mkFollower();
            follower.innerHTML = html;
            const img = follower.querySelector("img");
            if (img) img.style.cssText = "display:block;image-rendering:auto";
            runLoop(hx, hy, centered);
        };
        const startFrames = (frames, durations, hx, hy) => {
            mkFollower();
            const img = document.createElement("img");
            img.style.cssText = "display:block;image-rendering:auto";
            follower.append(img);
            runLoop(hx, hy, false);
            let i = 0;
            const tick = () => {
                if (!follower) return;
                img.src = frames[i % frames.length];
                const d = durations[i % durations.length] || 100;
                i++;
                frameTimer = setTimeout(tick, Math.max(20, d));
            };
            tick();
        };

        const staticValue = mode => {
            if (mode === "custom") {
                const url = String(api.settings.get("url", "")).trim();
                if (!/^https?:\/\/\S+|^data:image\//i.test(url)) return null;
                return 'url("' + url.replace(/"/g, "%22") + '") ' + (Number(api.settings.get("hx", 0)) || 0) + " " + (Number(api.settings.get("hy", 0)) || 0) + ", auto";
            }
            const p = STATIC[mode];
            return p ? 'url("data:image/svg+xml,' + encodeURIComponent(p.svg) + '") ' + p.hx + " " + p.hy + ", auto" : null;
        };

        const refresh = () => {
            const mode = api.settings.get("preset", "arrow-blue");
            const keepText = api.settings.get("keepText", true);
            const textCss = keepText ? '\ninput, textarea, [role="textbox"], [contenteditable="true"] { cursor: text !important; }' : "";
            if (mode === "off") { cssStyle.textContent = ""; stopFollower(); return; }
            if (STATIC[mode] || mode === "custom") {
                stopFollower();
                const cur = staticValue(mode);
                cssStyle.textContent = cur ? "html, body, * { cursor: " + cur + " !important; }" + textCss : "";
                return;
            }
            if (mode === "gif") {
                const url = String(api.settings.get("url", "")).trim();
                if (!/^https?:\/\/\S+|^data:image\//i.test(url)) { cssStyle.textContent = textCss; stopFollower(); return; }
                cssStyle.textContent = "html, body, * { cursor: none !important; }" + textCss;
                startFrames([url], [100], Number(api.settings.get("hx", 0)) || 0, Number(api.settings.get("hy", 0)) || 0);
            } else if (mode === "file") {
                const frames = api.settings.get("fileFrames", null);
                if (!Array.isArray(frames) || !frames.length) { cssStyle.textContent = textCss; stopFollower(); return; }
                cssStyle.textContent = "html, body, * { cursor: none !important; }" + textCss;
                startFrames(frames, api.settings.get("fileDurations", []) || [], Number(api.settings.get("fileHx", 0)) || 0, Number(api.settings.get("fileHy", 0)) || 0);
            } else if (ANIM[mode]) {
                cssStyle.textContent = "html, body, * { cursor: none !important; }" + textCss;
                startHtml(ANIM[mode], 0, 0, true);
            }
        };
        refresh();
        this.__refresh = refresh;

        // ---------- .ani / .cur / .ico importer ----------
        // Decode one embedded icon/cursor to a PNG data-URI by letting the browser's image decoder handle it.
        const icoToPng = fb => new Promise(res => {
            try {
                const patched = fb.slice(); patched[2] = 1; patched[3] = 0; // force type=icon so <img> renders it
                const url = URL.createObjectURL(new Blob([patched], { type: "image/x-icon" }));
                const img = new Image();
                img.onload = () => { try { const c = document.createElement("canvas"); c.width = img.naturalWidth || 32; c.height = img.naturalHeight || 32; c.getContext("2d").drawImage(img, 0, 0); res(c.toDataURL("image/png")); } catch { res(null); } URL.revokeObjectURL(url); };
                img.onerror = () => { res(null); URL.revokeObjectURL(url); };
                img.src = url;
            } catch { res(null); }
        });
        const parseAni = buf => {
            const u8 = new Uint8Array(buf), dv = new DataView(buf);
            const tag = o => String.fromCharCode(u8[o], u8[o + 1], u8[o + 2], u8[o + 3]);
            const out = { frames: [], rates: [], seq: null, defRate: 10 };
            let o = 12;
            while (o + 8 <= buf.byteLength) {
                const id = tag(o), size = dv.getUint32(o + 4, true), body = o + 8;
                if (id === "anih") { out.defRate = dv.getUint32(body + 28, true) || 10; }
                else if (id === "rate") { for (let i = 0; i < size / 4; i++) out.rates.push(dv.getUint32(body + i * 4, true)); }
                else if (id === "seq ") { out.seq = []; for (let i = 0; i < size / 4; i++) out.seq.push(dv.getUint32(body + i * 4, true)); }
                else if (id === "LIST" && tag(body) === "fram") {
                    let p = body + 4;
                    while (p + 8 <= body + size) { const cid = tag(p), csz = dv.getUint32(p + 4, true); if (cid === "icon") out.frames.push(u8.slice(p + 8, p + 8 + csz)); p += 8 + csz + (csz & 1); }
                }
                o = body + size + (size & 1);
            }
            return out;
        };
        const parseCursorFile = async buf => {
            const u8 = new Uint8Array(buf);
            const tag = o => String.fromCharCode(u8[o], u8[o + 1], u8[o + 2], u8[o + 3]);
            let frameBytes = [], durations = [];
            if (tag(0) === "RIFF" && tag(8) === "ACON") {
                const a = parseAni(buf);
                if (!a.frames.length) return null;
                const steps = (a.seq && a.seq.length) ? a.seq : a.frames.map((_, i) => i);
                frameBytes = steps.map(idx => a.frames[idx]).filter(Boolean);
                durations = steps.map((_, i) => Math.round((a.rates[i] || a.defRate) * 1000 / 60));
            } else if (u8[0] === 0 && u8[1] === 0 && (u8[2] === 1 || u8[2] === 2)) {
                frameBytes = [u8]; durations = [100];
            } else return null;
            if (!frameBytes.length) return null;
            let hx = 0, hy = 0;
            try { const fb = frameBytes[0]; if (fb[2] === 2) { const d = new DataView(fb.buffer, fb.byteOffset, fb.byteLength); hx = d.getUint16(10, true); hy = d.getUint16(12, true); } } catch { }
            const frames = [];
            for (const fb of frameBytes) { const png = await icoToPng(fb); if (!png) return null; frames.push(png); }
            if (frames.reduce((s, f) => s + f.length, 0) > 4 * 1024 * 1024) return null; // too big for settings
            return { frames, durations, hx, hy };
        };
        this.__import = async (file, done) => {
            try {
                const parsed = await parseCursorFile(await file.arrayBuffer());
                if (!parsed) { done(false, "Couldn't read that file (need a .ani, .cur or .ico cursor)."); return; }
                api.settings.set("fileFrames", parsed.frames);
                api.settings.set("fileDurations", parsed.durations);
                api.settings.set("fileHx", parsed.hx); api.settings.set("fileHy", parsed.hy);
                api.settings.set("fileName", file.name); api.settings.set("preset", "file");
                refresh();
                done(true, file.name + " — " + parsed.frames.length + " frame(s)");
            } catch (e) { done(false, "Error: " + (e && e.message || e)); }
        };
    },

    options(api) {
        const h = api.ui.h;
        const re = () => { if (this.__refresh) this.__refresh(); };
        const presets = [
            ["off", "Off (normal cursor)"],
            ["arrow-blue", "Arrow — blue"], ["arrow-white", "Arrow — white"], ["arrow-pink", "Arrow — pink"],
            ["dot", "Dot"], ["ring", "Ring"], ["crosshair", "Crosshair"],
            ["pulse", "Animated — Pulse"], ["ring-spin", "Animated — Spinning ring"], ["rainbow", "Animated — Rainbow dot"], ["glow", "Animated — Glow"],
            ["gif", "Animated image / GIF (URL below)"],
            ["file", "Imported .ani / .cur file"],
            ["custom", "Custom static image (URL below)"]
        ];
        const slider = h("input", { type: "range", min: "0", max: "90", step: "5" });
        slider.value = String(api.settings.get("smooth", 0));
        slider.style.cssText = "width:150px;accent-color:#9dbfea";
        const sLabel = h("span", null, api.settings.get("smooth", 0) + "%");
        slider.addEventListener("input", () => { sLabel.textContent = slider.value + "%"; api.settings.set("smooth", Number(slider.value)); re(); });

        const status = api.ui.note(api.settings.get("fileName", "") ? "Loaded file: " + api.settings.get("fileName", "") : "No file loaded.");
        const importBtn = h("button", { type: "button", class: "fc-btn", style: "height:30px" }, "Import .ani / .cur file…");
        importBtn.addEventListener("click", () => {
            const inp = h("input", { type: "file", accept: ".ani,.cur,.ico", style: "display:none" });
            inp.addEventListener("change", () => {
                const f = inp.files && inp.files[0];
                if (!f) return;
                status.textContent = "Reading " + f.name + "…";
                if (this.__import) this.__import(f, (ok, msg) => { status.textContent = (ok ? "Loaded: " : "Failed: ") + msg; });
            });
            document.body.append(inp); inp.click(); setTimeout(() => inp.remove(), 1000);
        });

        return [
            api.ui.row("Cursor", api.ui.select(presets, api.settings.get("preset", "arrow-blue"), v => { api.settings.set("preset", v); re(); })),
            api.ui.row("Trail / smoothing (animated, GIF & file)", h("div", { style: "display:flex;align-items:center;gap:10px" }, slider, sLabel)),
            api.ui.row("Keep text cursor in message boxes", api.ui.toggle(api.settings.get("keepText", true), v => { api.settings.set("keepText", v); re(); })),
            api.ui.note("Import a Windows animated cursor (.ani) or static cursor (.cur/.ico). It's decoded to frames and set as your cursor. The hotspot is read from the file automatically."),
            api.ui.row("Cursor file", importBtn), status,
            api.ui.note("For “GIF” or “Custom static” instead: paste a direct image link below and set the hotspot (the pixel that clicks)."),
            api.ui.textarea(api.settings.get("url", ""), v => { api.settings.set("url", v); re(); }, "https://example.com/cursor.gif"),
            api.ui.row("Hotspot X (URL modes)", api.ui.input(api.settings.get("hx", 0), v => { api.settings.set("hx", v); re(); }, "0", "number")),
            api.ui.row("Hotspot Y (URL modes)", api.ui.input(api.settings.get("hy", 0), v => { api.settings.set("hy", v); re(); }, "0", "number")),
            api.ui.note("Animated/GIF/file cursors hide the real pointer and draw a follower; raise trail for a smooth-lag effect. Only affects the Discord window.")
        ];
    }
});
