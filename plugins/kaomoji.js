// Kaomoji: type a short code like ;;shrug anywhere in a message and it becomes a kaomoji.
// Also a one-click picker in the settings that copies a kaomoji to your clipboard.
(window.beecord || window.blxstncord).definePlugin({
    id: "kaomoji",
    name: "Kaomoji",
    description: "Type ;;shrug, ;;flip, ;;happy … to drop in a kaomoji, or pick one from the settings to copy.",
    author: "beecord",
    version: "1.0.0",
    category: "Chat",
    enabledByDefault: false,
    webpack: false,

    start(api) {
        const K = this.__k = {
            shrug: "¯\\_(ツ)_/¯",
            flip: "(╯°□°)╯︵ ┻━┻",
            unflip: "┬─┬ノ( º _ ºノ)",
            happy: "(─◕‿─◕─)",
            lenny: "( ͡° ͜ʖ ͡°)",
            sad: "(｡•́︿•̀｡)",
            cry: "(╥﹏╥)",
            love: "(づ￣ ³￣)づ",
            cat: "(=^･ω･^=)",
            bear: "ʕ•ᴥ•ʔ",
            wink: "(^_~)",
            angry: "(╬ಠ益ಠ)",
            dance: "♪┏(・o･)┛♪",
            magic: "(｡•̀ᴗ-)✧",
            cool: "(⌐■_■)",
            wave: "(ﾉ´ ∀ `)ﾉ",
            confused: "(°◇°)?",
            star: "✧･ﾟ",
            hug: "(づ｡◕‿‿◕｡)づ",
            giveup: "╮(╯_╰)╭",
            why: "ლ(ಠ益ಠ)ლ",
            yay: "\\(^o^)/",
            think: "(._.)",
            run: "ε=ε=ε=┌(;*´Д`)ﾉ"
        };
        this.__list = Object.keys(K);

        api.messages.onSend(msg => {
            if (typeof msg.content !== "string" || !msg.content.includes(";;")) return;
            let changed = false;
            msg.content = msg.content.replace(/;;([a-z]+)/gi, (all, name) => {
                const v = K[name.toLowerCase()];
                if (v) { changed = true; return v; }
                return all;
            });
            return changed ? msg : undefined;
        }, 12);
    },

    options(api) {
        const { h } = api.ui;
        const K = this.__k || {};
        const grid = h("div", { style: "display:flex;flex-wrap:wrap;gap:6px;margin-top:4px" });
        for (const [name, v] of Object.entries(K)) {
            const b = h("button", { type: "button", title: ";;" + name, style: "all:unset;cursor:pointer;padding:5px 9px;border-radius:6px;border:1px solid var(--ig-input-border,#262626);background:var(--ig-input,#181818);color:var(--ig-bright,#e8ecf2);font-size:12px" }, v);
            b.addEventListener("click", async () => {
                let ok = false;
                try { await navigator.clipboard.writeText(v); ok = true; } catch { }
                const prev = b.textContent;
                b.textContent = ok ? "copied!" : v;
                setTimeout(() => { if (b.isConnected) b.textContent = prev; }, 900);
            });
            grid.append(b);
        }
        return [api.ui.note("Type ;;name in a message (e.g. ;;shrug), or click one to copy it:"), grid];
    }
});
