// Leak Guard: checks every message before it is sent for things you probably don't want to post:
// Discord tokens, API keys, private keys, passwords, e-mails, phone numbers, IP addresses, card numbers (Luhn),
// IBANs, PESEL numbers, GPS coordinates and your own custom words (real name, street, school, ...).
// Found something -> you get a dialog and decide. Tokens and private keys can be blocked outright.
(window.beecord || window.blxstncord).definePlugin({
    id: "leak-guard",
    name: "Leak Guard",
    description: "Warns before you send tokens, API keys, passwords, e-mails, phone numbers, IPs, card/IBAN/PESEL numbers, GPS coordinates or your own private words.",
    author: "beecord",
    version: "1.0.0",
    enabledByDefault: true,
    webpack: false,

    start(api) {
        const luhn = s => { let sum = 0, alt = false; for (let i = s.length - 1; i >= 0; i--) { let n = +s[i]; if (alt) { n *= 2; if (n > 9) n -= 9; } sum += n; alt = !alt; } return sum % 10 === 0; };
        const pesel = s => { const w = [1, 3, 7, 9, 1, 3, 7, 9, 1, 3]; let sum = 0; for (let i = 0; i < 10; i++) sum += w[i] * +s[i]; return (10 - (sum % 10)) % 10 === +s[10]; };
        const ibanOk = s => {
            const x = s.replace(/\s+/g, "").toUpperCase();
            if (x.length < 15 || x.length > 34) return false;
            const r = (x.slice(4) + x.slice(0, 4)).replace(/[A-Z]/g, c => String(c.charCodeAt(0) - 55));
            let m = 0; for (const ch of r) m = (m * 10 + +ch) % 97; return m === 1;
        };
        // [id, label, regex, extra check, "block" = cannot be sent without turning the check off]
        const CHECKS = [
            ["token", "Discord token", /\b(?:mfa\.[\w-]{80,}|[\w-]{23,28}\.[\w-]{6,7}\.[\w-]{27,40})\b/g, null, true],
            ["privkey", "Private key", /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/g, null, true],
            ["apikey", "API key / secret", /\b(?:sk-(?:ant-|proj-)?[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{35}|xox[abprs]-[A-Za-z0-9-]{10,}|sk_live_[A-Za-z0-9]{20,}|glpat-[A-Za-z0-9_-]{20,}|npm_[A-Za-z0-9]{36})\b/g, null, true],
            ["password", "Password", /\b(?:password|passwd|pass|pwd|hasło|haslo)\s*[:=]\s*\S{4,}/gi, null, false],
            ["email", "E-mail address", /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, null, false],
            ["phone", "Phone number", /(?<![\d\w])(?:\+\d{1,3}[ -]?)?\d{3}[ -]?\d{3}[ -]?\d{3,4}(?![\d\w])/g, m => m.replace(/\D/g, "").length >= 9, false],
            // local/private ranges and 1.2.3.4-style version numbers are ignored
            ["ip", "IP address", /(?<![\d.])(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)(?![\d.])/g,
                m => !/^(127|0|255|10)\./.test(m) && !/^192\.168\./.test(m) && !/^172\.(1[6-9]|2\d|3[01])\./.test(m) && !/^\d\.\d\.\d\.\d$/.test(m), false],
            ["card", "Payment card number", /(?<!\d)(?:\d[ -]?){13,19}(?!\d)/g, m => { const d = m.replace(/\D/g, ""); return d.length >= 13 && d.length <= 19 && luhn(d) && !/^(\d)\1+$/.test(d); }, false],
            ["iban", "IBAN / bank account", /\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{4}){3,7}(?:[ ]?[A-Z0-9]{1,3})?\b|(?<!\d)\d{2}(?:[ ]?\d{4}){6}(?!\d)/g,
                m => /^[A-Z]{2}/.test(m) ? ibanOk(m) : ibanOk("PL" + m), false],
            ["pesel", "PESEL number", /(?<!\d)\d{11}(?!\d)/g, pesel, false],
            ["gps", "GPS coordinates", /(?<![\d.])-?\d{1,2}\.\d{4,},\s*-?\d{1,3}\.\d{4,}(?![\d.])/g, null, false]
        ];
        this.__checks = CHECKS;
        const mask = s => s.length <= 6 ? s[0] + "•••" : s.slice(0, 3) + "•••" + s.slice(-2);
        const NUMERIC = new Set(["phone", "card", "iban", "pesel"]);
        const scan = text => {
            const hits = [];
            // Discord markup (timestamps, mentions, channels, custom emoji) is full of long numbers -> remove first
            const base = text.replace(/<(?:t:-?\d+(?::[tTdDfFR])?|@[!&]?\d+|#\d+|a?:\w+:\d+|\/[\w -]+:\d+)>/g, " ");
            const noUrl = base.replace(/https?:\/\/\S+/gi, " ");
            for (const [id, label, re, ok, block] of CHECKS) {
                if (!api.settings.get("c_" + id, true)) continue;
                re.lastIndex = 0;
                const found = [...(NUMERIC.has(id) ? noUrl : base).matchAll(re)].map(m => m[0].trim()).filter(m => !ok || ok(m));
                if (found.length) hits.push({ id, label, block: block && api.settings.get("hardBlock", true), samples: [...new Set(found)].slice(0, 3).map(mask) });
            }
            const words = String(api.settings.get("words", "")).split(/\r?\n|,/).map(w => w.trim()).filter(w => w.length >= 3);
            const lower = text.toLowerCase();
            const wf = words.filter(w => lower.includes(w.toLowerCase()));
            if (wf.length) hits.push({ id: "words", label: "Your private words", block: false, samples: wf.slice(0, 3).map(mask) });
            return hits;
        };
        this.__scan = scan;

        api.messages.onSend(async (msg, ctx) => {
            if (typeof msg.content !== "string" || !msg.content) return;
            if (ctx.edit && !api.settings.get("edits", true)) return;
            const hits = scan(msg.content);
            if (!hits.length) return;
            const list = hits.map(h => "• " + h.label + ": " + h.samples.join(", ")).join("\n");
            if (hits.some(h => h.block)) {
                await api.ui.confirm("Blocked: secret detected", "This message contains something that gives full access to an account:\n\n" + list +
                    "\n\nIt was NOT sent. If you really need to send it, turn off \"Always block tokens and keys\" in Leak Guard.", "OK", "Close");
                api.toast("Leak Guard: message not sent", "#da373c", 4000);
                return false;
            }
            const ok = await api.ui.confirm("Send personal data?", "This message seems to contain:\n\n" + list + "\n\nSend it anyway?", "Send anyway", "Don't send");
            if (!ok) api.toast("Leak Guard: not sent.", "#4e5058", 2500);
            return ok ? msg : false;
        }, 70);
    },

    options(api) {
        const checks = this.__checks || [];
        const rows = checks.map(([id, label, , , block]) => api.ui.row(label + (block ? " (blocked)" : ""),
            api.ui.toggle(api.settings.get("c_" + id, true), v => api.settings.set("c_" + id, v))));
        const tester = api.ui.textarea("", v => {
            const hits = this.__scan ? this.__scan(v) : [];
            out.textContent = v.trim() ? (hits.length ? "Would warn: " + hits.map(h => h.label).join(", ") : "Nothing found.") : "";
        }, "Test text here (nothing is sent)");
        tester.style.minHeight = "60px";
        const out = api.ui.note("");
        return [
            api.ui.row("Always block tokens and keys (no \"send anyway\")", api.ui.toggle(api.settings.get("hardBlock", true), v => api.settings.set("hardBlock", v))),
            api.ui.row("Also check edited messages", api.ui.toggle(api.settings.get("edits", true), v => api.settings.set("edits", v))),
            ...rows,
            api.ui.note("Your private words (one per line or comma separated): real name, surname, street, city, school, workplace, nicknames…"),
            api.ui.textarea(api.settings.get("words", ""), v => api.settings.set("words", v), "Jan Kowalski\nul. Długa 5\nLiceum nr 3"),
            api.ui.note("Try it:"), tester, out
        ];
    }
});
