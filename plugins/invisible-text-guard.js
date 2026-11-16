// Invisible Text Guard: hidden characters (zero-width spaces, bidi overrides, Unicode "tag" letters) can carry
// invisible watermarks: a leaked copy of a text can be traced back to who received it, and tag letters can hide
// secret instructions. This plugin:
//  - removes them from messages you send,
//  - removes them from text you copy out of Discord,
//  - marks received messages that contain them.
// Emoji keep working: joiners inside emoji (👨‍👩‍👧) and flag tags (🏴󠁧󠁢󠁳󠁣󠁴󠁿) are kept.
(window.beecord || window.blxstncord).definePlugin({
    id: "invisible-text-guard",
    name: "Invisible Text Guard",
    description: "Strips hidden zero-width / bidi / tag characters (used for invisible watermarks) from messages you send and text you copy, and marks messages that contain them.",
    author: "beecord",
    version: "1.0.0",
    enabledByDefault: true,
    webpack: false,

    start(api) {
        const PIC = "(?:\\p{Extended_Pictographic}|[\\u{1F3FB}-\\u{1F3FF}])"; // emoji + skin-tone modifiers
        // ZWJ between emoji, and tag letters after the black flag, are legit
        const HIDDEN = new RegExp(
            "(?<!" + PIC + "\\uFE0F?)\\u200D|\\u200D(?!" + PIC + ")" +       // ZWJ not inside an emoji sequence
            "|[\\u200B\\u200C\\u200E\\u200F\\u2060-\\u2064\\u2066-\\u2069\\u202A-\\u202E\\uFEFF\\u180E\\u00AD\\u034F\\u115F\\u1160\\u3164\\uFFA0]" +
            "|(?<!\\u{1F3F4}[\\u{E0020}-\\u{E007E}]*)[\\u{E0000}-\\u{E007F}]", "gu");
        const count = s => (String(s).match(HIDDEN) || []).length;
        const clean = s => String(s).replace(HIDDEN, "");
        const decodeTags = s => [...String(s)].filter(c => { const p = c.codePointAt(0); return p >= 0xE0020 && p <= 0xE007E; })
            .map(c => String.fromCharCode(c.codePointAt(0) - 0xE0000)).join("");
        this.__count = count;

        let stats = this.__stats = { sent: 0, copied: 0, seen: 0 };

        api.messages.onSend(msg => {
            if (!api.settings.get("send", true) || typeof msg.content !== "string") return;
            const n = count(msg.content);
            if (!n) return;
            msg.content = clean(msg.content);
            stats.sent += n;
            api.toast("Removed " + n + " hidden character(s) from your message", "#4e5058", 2200);
            return msg;
        }, 5);

        api.on(document, "copy", e => {
            if (!api.settings.get("copy", true)) return;
            const sel = window.getSelection && window.getSelection();
            const text = sel ? sel.toString() : "";
            if (!text || !count(text)) return;
            // let copies from the message box / inputs behave normally (Discord handles those)
            const a = document.activeElement;
            if (a && (a.isContentEditable || /^(INPUT|TEXTAREA)$/.test(a.tagName))) return;
            e.preventDefault();
            e.clipboardData.setData("text/plain", clean(text));
            stats.copied += count(text);
            api.toast("Copied without " + count(text) + " hidden character(s)", "#4e5058", 2000);
        }, true);

        api.addStyle(`
            [data-bc-hidden]::before{content:"⚠ hidden characters: " attr(data-bc-hidden);display:block;width:max-content;margin-bottom:2px;
                padding:0 6px;border-radius:4px;font-size:11px;font-weight:600;color:#000;background:#f0b232}`);
        const scan = () => {
            if (!api.settings.get("mark", true)) return;
            for (const el of document.querySelectorAll('li[id^="chat-messages-"] [id^="message-content-"]')) {
                const t = el.textContent || "";
                if (el.__bcText === t) continue;
                el.__bcText = t;
                const n = count(t);
                if (n) {
                    const tags = decodeTags(t);
                    el.setAttribute("data-bc-hidden", n + (tags ? " (hidden text: \"" + tags.slice(0, 60) + "\")" : ""));
                    stats.seen++;
                } else el.removeAttribute("data-bc-hidden");
            }
        };
        // shared core watcher; the 3 s interval catches messages edited in place (text changes without new nodes)
        api.dom.observe(scan, { interval: 3000 });
        api.cleanup(() => { for (const el of document.querySelectorAll("[data-bc-hidden]")) el.removeAttribute("data-bc-hidden"); });
    },

    options(api) {
        const s = this.__stats || { sent: 0, copied: 0, seen: 0 };
        return [
            api.ui.row("Remove from messages I send", api.ui.toggle(api.settings.get("send", true), v => api.settings.set("send", v))),
            api.ui.row("Remove from text I copy", api.ui.toggle(api.settings.get("copy", true), v => api.settings.set("copy", v))),
            api.ui.row("Mark received messages that contain them", api.ui.toggle(api.settings.get("mark", true), v => api.settings.set("mark", v))),
            api.ui.note("This session: " + s.sent + " removed from sent messages, " + s.copied + " from copied text, " + s.seen + " message(s) marked.")
        ];
    }
});
