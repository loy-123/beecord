// Fancy Fonts: start a message with ;style to send it in a Unicode style (everyone sees the same text).
//   ;bold hello   ;italic hi   ;mono code   ;tiny small   ;flip woah   ;clap say it   ;spread wide
// Full list in the plugin's settings. The ;style prefix is removed before sending.
(window.beecord || window.blxstncord).definePlugin({
    id: "fancy-fonts",
    name: "Fancy Fonts",
    description: "Type ;bold, ;italic, ;mono, ;tiny, ;cursive, ;flip, ;clap, ;spread … to send your message in a Unicode style.",
    author: "beecord",
    version: "1.0.0",
    category: "Chat",
    enabledByDefault: false,
    webpack: false,

    start(api) {
        const mathStyle = (U, Lo, D, ex) => s => [...s].map(c => {
            if (ex && ex[c]) return ex[c];
            const n = c.codePointAt(0);
            if (c >= "A" && c <= "Z") return String.fromCodePoint(U + n - 65);
            if (c >= "a" && c <= "z") return String.fromCodePoint(Lo + n - 97);
            if (D != null && c >= "0" && c <= "9") return String.fromCodePoint(D + n - 48);
            return c;
        }).join("");
        const mapStyle = (upper, lower, digits) => {
            const UP = "ABCDEFGHIJKLMNOPQRSTUVWXYZ", LW = "abcdefghijklmnopqrstuvwxyz", DG = "0123456789";
            const m = {};
            [...upper].forEach((c, i) => m[UP[i]] = c);
            if (lower) [...lower].forEach((c, i) => m[LW[i]] = c);
            if (digits) [...digits].forEach((c, i) => m[DG[i]] = c);
            return s => [...s].map(c => m[c] || c).join("");
        };
        const styles = {
            bold: mathStyle(0x1D400, 0x1D41A, 0x1D7CE),
            sans: mathStyle(0x1D5D4, 0x1D5EE, 0x1D7EC),
            italic: mathStyle(0x1D434, 0x1D44E, null, { h: "ℎ" }),
            bolditalic: mathStyle(0x1D468, 0x1D482, null),
            mono: mathStyle(0x1D670, 0x1D68A, 0x1D7F6),
            cursive: mathStyle(0x1D4D0, 0x1D4EA, null),                 // bold script (fully filled)
            fraktur: mathStyle(0x1D56C, 0x1D586, null),                 // bold fraktur (fully filled)
            double: mathStyle(0x1D538, 0x1D552, 0x1D7D8, { C: "ℂ", H: "ℍ", N: "ℕ", P: "ℙ", Q: "ℚ", R: "ℝ", Z: "ℤ" }),
            wide: mapStyle("ＡＢＣＤＥＦＧＨＩＪＫＬＭＮＯＰＱＲＳＴＵＶＷＸＹＺ", "ａｂｃｄｅｆｇｈｉｊｋｌｍｎｏｐｑｒｓｔｕｖｗｘｙｚ", "０１２３４５６７８９"),
            tiny: mapStyle("ᴬᴮꟲᴰᴱꟳᴳᴴᴵᴶᴷᴸᴹᴺᴼᴾꟴᴿˢᵀᵁⱽᵂˣʸᶻ", "ᵃᵇᶜᵈᵉᶠᵍʰⁱʲᵏˡᵐⁿᵒᵖ۹ʳˢᵗᵘᵛʷˣʸᶻ", "⁰¹²³⁴⁵⁶⁷⁸⁹"),
            smallcaps: mapStyle("ABCDEFGHIJKLMNOPQRSTUVWXYZ", "ᴀʙᴄᴅᴇꜰɢʜɪᴊᴋʟᴍɴᴏᴘꞯʀꜱᴛᴜᴠᴡxʏᴢ"),
            flip: s => {
                const f = { a: "ɐ", b: "q", c: "ɔ", d: "p", e: "ǝ", f: "ɟ", g: "ƃ", h: "ɥ", i: "ᴉ", j: "ɾ", k: "ʞ", l: "l", m: "ɯ", n: "u", o: "o", p: "d", q: "b", r: "ɹ", s: "s", t: "ʇ", u: "n", v: "ʌ", w: "ʍ", x: "x", y: "ʎ", z: "z", A: "∀", B: "ꓭ", C: "Ɔ", D: "ꓷ", E: "Ǝ", F: "Ⅎ", G: "⅁", H: "H", I: "I", J: "ꓩ", K: "ꓘ", L: "ꓶ", M: "W", N: "N", O: "O", P: "Ԁ", Q: "Ò", R: "ꓤ", S: "S", T: "⊥", U: "∩", V: "Λ", W: "M", X: "X", Y: "⅄", Z: "Z", 0: "0", 1: "Ɩ", 2: "ᄅ", 3: "Ɛ", 4: "ㄣ", 5: "ϛ", 6: "9", 7: "ㄥ", 8: "8", 9: "6", "?": "¿", "!": "¡", ".": "˙", ",": "'", "'": ",", "(": ")", ")": "(", "[": "]", "]": "[", "{": "}", "}": "{", "<": ">", ">": "<", "_": "‾", "&": "⅋" };
                return [...s].reverse().map(c => f[c] || c).join("");
            },
            spread: s => [...s].join(" "),
            clap: s => s.trim().split(/\s+/).join(" 👏 ")
        };
        this.__styles = styles;
        const ALIASES = { b: "bold", i: "italic", bi: "bolditalic", m: "mono", s: "sans", fw: "wide", small: "tiny", caps: "smallcaps", upside: "flip", script: "cursive", goth: "fraktur", gothic: "fraktur", ds: "double" };

        api.messages.onSend((msg, ctx) => {
            if (typeof msg.content !== "string") return;
            const m = /^;([a-z]+)[ \n]/i.exec(msg.content);
            if (!m) return;
            const name = ALIASES[m[1].toLowerCase()] || m[1].toLowerCase();
            const fn = styles[name];
            if (!fn) return;
            const rest = msg.content.slice(m[0].length);
            // leave @mentions, <:emoji:>, <t:..> and links untouched; transform the text between them as whole runs
            const KEEP = /(<a?:\w+:\d+>|<@[!&]?\d+>|<#\d+>|<t:-?\d+(?::[a-zA-Z])?>|https?:\/\/\S+)/g;
            msg.content = rest.split(KEEP).map((part, i) => (i % 2 === 1 ? part : fn(part))).join("");
            return msg;
        }, 15);
    },

    options(api) {
        const s = this.__styles || {};
        const demo = Object.keys(s).map(k => "  ;" + k + "  →  " + s[k]("Hello 123").slice(0, 22)).join("\n");
        return [api.ui.note("Start a message with one of these, then a space:\n" + demo + "\n\nShort forms: ;b ;i ;m ;s ;fw ;small ;caps ;upside ;script ;goth")];
    }
});
