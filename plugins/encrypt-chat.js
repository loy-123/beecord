// Encrypted Messages: end-to-end encrypt your messages with a shared password (AES-256-GCM).
// Anyone with the same password set in this plugin sees the real text; everyone else sees only ciphertext.
// Nothing is sent anywhere except the normal Discord message. All crypto is done locally with Web Crypto.
(window.beecord || window.blxstncord).definePlugin({
    id: "encrypt-chat",
    name: "Encrypted Messages",
    description: "End-to-end encrypt messages with a shared password (AES-256-GCM). Only people with the same password can read them.",
    author: "beecord",
    version: "1.0.0",
    category: "Privacy & Safety",
    enabledByDefault: false,
    webpack: false,

    start(api) {
        const MARK = "🔒BCENC1:";          // lock + marker; the rest is base64url(salt|iv|ciphertext)
        const RE = /🔒BCENC1:([A-Za-z0-9_-]{24,})/;
        const enc = new TextEncoder(), dec = new TextDecoder();
        const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
        const unb64u = s => { s = s.replace(/-/g, "+").replace(/_/g, "/"); while (s.length % 4) s += "="; const b = atob(s); const u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; };
        const subtle = window.crypto && window.crypto.subtle;
        if (!subtle) { api.log("Web Crypto not available"); return; }

        const keyCache = new Map();
        async function deriveKey(pass, salt) {
            const ck = pass + ":" + b64u(salt);
            if (keyCache.has(ck)) return keyCache.get(ck);
            const base = await subtle.importKey("raw", enc.encode(pass), "PBKDF2", false, ["deriveKey"]);
            const key = await subtle.deriveKey({ name: "PBKDF2", salt, iterations: 150000, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
            keyCache.set(ck, key);
            return key;
        }
        async function encrypt(text, pass) {
            const salt = crypto.getRandomValues(new Uint8Array(16));
            const iv = crypto.getRandomValues(new Uint8Array(12));
            const key = await deriveKey(pass, salt);
            const ct = await subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(text));
            const out = new Uint8Array(16 + 12 + ct.byteLength);
            out.set(salt, 0); out.set(iv, 16); out.set(new Uint8Array(ct), 28);
            return MARK + b64u(out);
        }
        async function decrypt(payload, pass) {
            const raw = unb64u(payload);
            const salt = raw.slice(0, 16), iv = raw.slice(16, 28), ct = raw.slice(28);
            const key = await deriveKey(pass, salt);
            const pt = await subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
            return dec.decode(pt);
        }
        this.__encrypt = encrypt; this.__decrypt = decrypt;

        // ---- outgoing ----
        api.messages.onSend((msg, ctx) => {
            if (ctx.edit || typeof msg.content !== "string" || !msg.content) return;
            const pass = String(api.settings.get("password", ""));
            let doIt = api.settings.get("auto", false) && pass;
            let content = msg.content;
            if (/^#enc\s/i.test(content)) { doIt = !!pass; content = content.replace(/^#enc\s+/i, ""); }
            else if (/^#clear\s/i.test(content)) { msg.content = content.replace(/^#clear\s+/i, ""); return msg; }
            if (!doIt || !content) return;
            return (async () => { try { msg.content = await encrypt(content, pass); } catch (e) { api.log("encrypt failed: " + (e && e.message || e)); } return msg; })();
        }, 35);

        // ---- incoming: decrypt in place ----
        api.addStyle(`
            .bc-enc-dec{margin-top:2px;padding:4px 8px;border-radius:6px;display:inline-block;font-size:inherit;
                color:var(--text-default,#dbdee1);background:rgba(157,191,234,.1);box-shadow:inset 2px 0 0 #9dbfea}
            .bc-enc-dec b{color:#9dbfea;font-weight:700;margin-right:5px}
            [data-bc-enc="shown"]{opacity:.35;font-size:11px}`);
        const decoded = new Map(); // payload -> plaintext
        const scan = () => {
            const pass = String(api.settings.get("password", ""));
            if (!pass) return;
            for (const el of document.querySelectorAll('[id^="message-content-"]')) {
                const m = RE.exec(el.textContent || "");
                if (!m) { continue; }
                if (el.getAttribute("data-bc-enc") === "shown" && el.nextSibling && el.nextSibling.classList && el.nextSibling.classList.contains("bc-enc-dec")) continue;
                const payload = m[1];
                const place = text => {
                    if (el.nextSibling && el.nextSibling.classList && el.nextSibling.classList.contains("bc-enc-dec")) el.nextSibling.remove();
                    const box = document.createElement("div");
                    box.className = "bc-enc-dec";
                    const tag = document.createElement("b"); tag.textContent = "🔓";
                    box.append(tag, document.createTextNode(text));
                    el.after(box);
                    el.setAttribute("data-bc-enc", "shown");
                };
                if (decoded.has(payload)) { place(decoded.get(payload)); continue; }
                decoded.set(payload, "…");
                decrypt(payload, pass).then(pt => { decoded.set(payload, pt); place(pt); }).catch(() => { decoded.delete(payload); });
            }
        };
        api.dom.observe(scan, { throttle: 400 });
        api.cleanup(() => { for (const b of document.querySelectorAll(".bc-enc-dec")) b.remove(); for (const el of document.querySelectorAll('[data-bc-enc]')) el.removeAttribute("data-bc-enc"); });
    },

    options(api) {
        const out = api.ui.note("");
        const test = api.ui.input("", async v => {
            const p = String(api.settings.get("password", ""));
            if (!v || !p || !this.__encrypt) { out.textContent = ""; return; }
            try { const c = await this.__encrypt(v, p); const back = await this.__decrypt(c.split(":")[1], p); out.textContent = "OK — sends as: " + c.slice(0, 40) + "… (decrypts to: " + back + ")"; }
            catch (e) { out.textContent = "error: " + e.message; }
        }, "type to test");
        test.style.width = "220px";
        return [
            api.ui.note("Shared password (everyone in the conversation must set the SAME password to read each other):"),
            api.ui.input(api.settings.get("password", ""), v => api.settings.set("password", v), "a strong shared password", "password"),
            api.ui.row("Encrypt ALL my messages", api.ui.toggle(api.settings.get("auto", false), v => api.settings.set("auto", v))),
            api.ui.note("Or encrypt one message by starting it with “#enc ” (and “#clear ” sends one in the clear while auto is on)."),
            api.ui.row("Test", test), out,
            api.ui.note("Encryption is end-to-end and local. Note: encrypted messages can't contain working mentions or attachments, and the recipient needs beecord + this password to read them.")
        ];
    }
});
