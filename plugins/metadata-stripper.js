// Metadata Stripper: removes hidden metadata from images before they are uploaded, and renames files.
//  - JPEG: drops EXIF (GPS, camera, serial numbers, date), XMP, IPTC/Photoshop and comments. Lossless.
//    If the photo has an EXIF rotation, it is re-encoded instead (rotation applied), so it isn't shown sideways.
//  - PNG: drops tEXt/zTXt/iTXt (software, author, comments), eXIf and tIME chunks. Lossless.
//  - WebP: drops EXIF and XMP chunks. Lossless.
//  - Every file: the name can be replaced (names like "IMG_20240101_Jan_Kowalski.jpg" leak info).
// Works on paste, drag & drop and the upload button, before Discord sees the file.
(window.beecord || window.blxstncord).definePlugin({
    id: "metadata-stripper",
    name: "Metadata Stripper",
    description: "Removes EXIF/GPS and other hidden metadata from images you upload (JPEG, PNG, WebP) and can rename files to random names.",
    author: "beecord",
    version: "1.0.0",
    enabledByDefault: true,
    webpack: false,

    start(api) {
        const ours = new WeakSet();
        let stats = this.__stats = { files: 0, stripped: 0, bytes: 0 };

        // ---------- format strippers (work on Uint8Array, return Uint8Array or null if unchanged) ----------
        const u16 = (b, i) => (b[i] << 8) | b[i + 1];
        function jpegOrientation(b) {
            let i = 2;
            while (i + 4 < b.length && b[i] === 0xFF) {
                const mk = b[i + 1], len = u16(b, i + 2);
                if (mk === 0xDA) break;
                if (mk === 0xE1 && b[i + 4] === 0x45 && b[i + 5] === 0x78 && b[i + 6] === 0x69 && b[i + 7] === 0x66) {
                    const t = i + 10, le = b[t] === 0x49;
                    const r16 = o => le ? b[t + o] | (b[t + o + 1] << 8) : (b[t + o] << 8) | b[t + o + 1];
                    const r32 = o => le ? (b[t + o] | (b[t + o + 1] << 8) | (b[t + o + 2] << 16) | (b[t + o + 3] << 24)) >>> 0
                        : ((b[t + o] << 24) | (b[t + o + 1] << 16) | (b[t + o + 2] << 8) | b[t + o + 3]) >>> 0;
                    const ifd = r32(4), n = r16(ifd);
                    for (let k = 0; k < n; k++) {
                        const e = ifd + 2 + k * 12;
                        if (t + e + 10 > i + 2 + len) break;
                        if (r16(e) === 0x0112) return r16(e + 8);
                    }
                    return 1;
                }
                i += 2 + len;
            }
            return 1;
        }
        function stripJpeg(b) {
            if (b[0] !== 0xFF || b[1] !== 0xD8) return null;
            const parts = [b.subarray(0, 2)];
            let i = 2, removed = 0;
            while (i + 4 <= b.length) {
                if (b[i] !== 0xFF) return null; // unexpected layout -> leave the file alone
                const mk = b[i + 1];
                if (mk === 0xFF) { i++; continue; }
                if (mk === 0xDA || mk === 0xD9) { parts.push(b.subarray(i)); break; }
                const len = u16(b, i + 2);
                if (len < 2 || i + 2 + len > b.length) return null;
                // keep APP0 (JFIF), APP2 (ICC colour profile), APP14 (Adobe colour transform); drop APP1, APP3-13, APP15, COM
                const drop = (mk >= 0xE1 && mk <= 0xEF && mk !== 0xE2 && mk !== 0xEE) || mk === 0xFE;
                if (drop) removed++; else parts.push(b.subarray(i, i + 2 + len));
                i += 2 + len;
            }
            if (!removed) return null;
            return concat(parts);
        }
        function stripPng(b) {
            const sig = [137, 80, 78, 71, 13, 10, 26, 10];
            if (!sig.every((v, k) => b[k] === v)) return null;
            const parts = [b.subarray(0, 8)];
            let i = 8, removed = 0;
            const DROP = new Set(["tEXt", "zTXt", "iTXt", "eXIf", "tIME", "dSIG"]);
            while (i + 12 <= b.length) {
                const len = ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
                const type = String.fromCharCode(b[i + 4], b[i + 5], b[i + 6], b[i + 7]);
                const end = i + 12 + len;
                if (end > b.length) return null;
                if (DROP.has(type)) removed++; else parts.push(b.subarray(i, end));
                i = end;
                if (type === "IEND") break;
            }
            return removed ? concat(parts) : null;
        }
        function stripWebp(b) {
            const s4 = o => String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);
            if (s4(0) !== "RIFF" || s4(8) !== "WEBP") return null;
            const parts = [];
            let i = 12, removed = 0;
            while (i + 8 <= b.length) {
                const type = s4(i);
                const len = (b[i + 4] | (b[i + 5] << 8) | (b[i + 6] << 16) | (b[i + 7] << 24)) >>> 0;
                const end = i + 8 + len + (len & 1);
                if (i + 8 + len > b.length) return null;
                if (type === "EXIF" || type === "XMP ") removed++;
                else if (type === "VP8X") { const c = b.slice(i, i + 8 + len + (len & 1)); c[8] &= ~0x0C; parts.push(c); } // clear EXIF+XMP flags
                else parts.push(b.subarray(i, Math.min(end, b.length)));
                i = end;
            }
            if (!removed) return null;
            const body = concat(parts);
            const out = new Uint8Array(12 + body.length);
            out.set([0x52, 0x49, 0x46, 0x46], 0);
            const size = 4 + body.length;
            out[4] = size & 255; out[5] = (size >> 8) & 255; out[6] = (size >> 16) & 255; out[7] = (size >>> 24) & 255;
            out.set([0x57, 0x45, 0x42, 0x50], 8);
            out.set(body, 12);
            return out;
        }
        function concat(parts) {
            const n = parts.reduce((a, p) => a + p.length, 0);
            const out = new Uint8Array(n);
            let o = 0;
            for (const p of parts) { out.set(p, o); o += p.length; }
            return out;
        }
        this.__strip = { stripJpeg, stripPng, stripWebp, jpegOrientation }; // for testing

        async function reencode(file, type) {
            const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
            const c = new OffscreenCanvas(bmp.width, bmp.height);
            c.getContext("2d").drawImage(bmp, 0, 0);
            bmp.close && bmp.close();
            return c.convertToBlob({ type, quality: 0.93 });
        }

        const rand = () => Array.from(crypto.getRandomValues(new Uint8Array(5)), x => x.toString(16).padStart(2, "0")).join("");
        function newName(name, ext) {
            const mode = api.settings.get("rename", "random");
            const dot = name.lastIndexOf(".");
            let base = dot > 0 ? name.slice(0, dot) : name;
            ext = (ext || (dot > 0 ? name.slice(dot + 1) : "")).toLowerCase().replace(/^jpeg$/, "jpg");
            const spoiler = /^SPOILER_/.test(name) || api.settings.get("spoiler", false);
            base = base.replace(/^SPOILER_/, "");
            if (mode === "random") base = rand();
            else if (mode === "generic") base = /^(jpg|png|webp|gif|avif|bmp)$/.test(ext) ? "image" : /^(mp4|mov|webm|mkv)$/.test(ext) ? "video" : "file";
            return (spoiler ? "SPOILER_" : "") + base + (ext ? "." + ext : "");
        }

        async function clean(file) {
            stats.files++;
            const type = (file.type || "").toLowerCase();
            const isJpeg = type === "image/jpeg" || /\.jpe?g$/i.test(file.name);
            const isPng = type === "image/png" || /\.png$/i.test(file.name);
            const isWebp = type === "image/webp" || /\.webp$/i.test(file.name);
            let blob = file, outType = file.type, ext = null;
            if ((isJpeg || isPng || isWebp) && api.settings.get("strip", true) && file.size < 60 * 1024 * 1024) {
                const b = new Uint8Array(await file.arrayBuffer());
                let out = null;
                if (isJpeg) {
                    const orient = jpegOrientation(b);
                    if (orient > 1) { try { blob = await reencode(file, "image/jpeg"); outType = "image/jpeg"; ext = "jpg"; stats.stripped++; } catch (e) { api.log("re-encode failed: " + e.message); out = stripJpeg(b); } }
                    else out = stripJpeg(b);
                } else if (isPng) out = stripPng(b);
                else out = stripWebp(b);
                if (out) { blob = new Blob([out], { type: outType }); stats.stripped++; stats.bytes += b.length - out.length; }
            }
            const name = api.settings.get("rename", "random") === "keep" && !api.settings.get("spoiler", false) ? file.name : newName(file.name, ext);
            if (blob === file && name === file.name) return file;
            return new File([blob], name, { type: outType || file.type, lastModified: Date.now() });
        }

        async function cleanList(files) {
            const out = [];
            for (const f of files) {
                try { out.push(await clean(f)); }
                catch (e) { api.log("could not clean " + f.name + ": " + (e && e.message || e)); out.push(f); }
            }
            const dt = new DataTransfer();
            out.forEach(f => dt.items.add(f));
            return dt;
        }
        const wanted = files => files && files.length > 0;
        // never touch beecord's own panel (its theme-link field etc.)
        const inPanel = e => { const t = e.target; return t && t.closest && (t.closest("#blxstncord-panel") || t.closest("#beecord-panel")); };

        // paste into the message box
        api.on(window, "paste", e => {
            if (ours.has(e) || inPanel(e) || !e.clipboardData || !wanted(e.clipboardData.files)) return;
            e.preventDefault(); e.stopImmediatePropagation();
            const target = e.target;
            cleanList([...e.clipboardData.files]).then(dt => {
                const ev = new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true });
                ours.add(ev);
                target.dispatchEvent(ev);
                done(dt.files.length);
            });
        }, true);
        // drag & drop
        api.on(window, "drop", e => {
            if (ours.has(e) || inPanel(e) || !e.dataTransfer || !wanted(e.dataTransfer.files)) return;
            e.preventDefault(); e.stopImmediatePropagation();
            const { target, clientX, clientY, screenX, screenY } = e;
            cleanList([...e.dataTransfer.files]).then(dt => {
                const ev = new DragEvent("drop", { dataTransfer: dt, bubbles: true, cancelable: true, clientX, clientY, screenX, screenY });
                ours.add(ev);
                target.dispatchEvent(ev);
                done(dt.files.length);
            });
        }, true);
        // the "+" / upload button
        api.on(window, "change", e => {
            const inp = e.target;
            if (ours.has(e) || !(inp instanceof HTMLInputElement) || inp.type !== "file" || !wanted(inp.files)) return;
            e.stopImmediatePropagation();
            cleanList([...inp.files]).then(dt => {
                try { inp.files = dt.files; } catch { }
                const ev = new Event("change", { bubbles: true });
                ours.add(ev);
                inp.dispatchEvent(ev);
                done(dt.files.length);
            });
        }, true);

        function done(n) {
            if (api.settings.get("notify", true)) api.toast("Metadata Stripper: " + n + " file(s) cleaned", "#4e5058", 1800);
        }
    },

    options(api) {
        const s = this.__stats || { files: 0, stripped: 0, bytes: 0 };
        return [
            api.ui.row("Remove metadata from images (JPEG, PNG, WebP)", api.ui.toggle(api.settings.get("strip", true), v => api.settings.set("strip", v))),
            api.ui.row("File names", api.ui.select([["random", "Random (a3f9c01b2e.jpg)"], ["generic", "Generic (image.jpg)"], ["keep", "Keep original"]],
                api.settings.get("rename", "random"), v => api.settings.set("rename", v))),
            api.ui.row("Upload every file as spoiler", api.ui.toggle(api.settings.get("spoiler", false), v => api.settings.set("spoiler", v))),
            api.ui.row("Show a notice after cleaning", api.ui.toggle(api.settings.get("notify", true), v => api.settings.set("notify", v))),
            api.ui.note("This session: " + s.files + " file(s) checked, " + s.stripped + " cleaned, " + Math.round(s.bytes / 1024) + " KB of metadata removed. " +
                "Videos (MP4/MOV) and documents are only renamed: their internal metadata (e.g. phone GPS in MP4) is NOT removed.")
        ];
    }
});
