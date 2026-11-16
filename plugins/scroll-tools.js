// Scroll Tools: a floating button to jump to the newest message, and a key (Home-like) to jump to the top.
(window.beecord || window.blxstncord).definePlugin({
    id: "scroll-tools",
    name: "Scroll Tools",
    description: "A “jump to newest” button when you scroll up, and Alt+Home to jump to the very start of a chat.",
    author: "beecord",
    version: "1.0.0",
    category: "Tools",
    enabledByDefault: false,
    webpack: false,

    start(api) {
        const { h } = api.ui;
        const scroller = () => document.querySelector('[class*="messagesWrapper"] [class*="scroller"], [data-list-id="chat-messages"]');
        const NS = "http://www.w3.org/2000/svg";
        const svg = document.createElementNS(NS, "svg");
        svg.setAttribute("viewBox", "0 0 24 24"); svg.setAttribute("width", "18"); svg.setAttribute("height", "18");
        const p = document.createElementNS(NS, "path");
        p.setAttribute("fill", "currentColor"); p.setAttribute("d", "M12 16 6 10l1.4-1.4L12 13.2l4.6-4.6L18 10z");
        svg.appendChild(p);
        const btn = h("div", { id: "beecord-scrolltools", title: "Jump to newest" }, svg);
        btn.style.cssText = "position:fixed;right:28px;bottom:92px;z-index:1000;width:38px;height:38px;border-radius:50%;display:none;align-items:center;justify-content:center;cursor:pointer;" +
            "background:var(--ig-input,#181818);border:1px solid var(--ig-input-border,#262626);color:var(--ig-accent,#9dbfea);box-shadow:0 4px 16px rgba(0,0,0,.4);transition:transform .15s";
        btn.addEventListener("mouseenter", () => btn.style.transform = "scale(1.1)");
        btn.addEventListener("mouseleave", () => btn.style.transform = "scale(1)");
        document.body.append(btn);
        api.cleanup(() => btn.remove());

        btn.addEventListener("click", () => {
            const sc = scroller(); if (!sc) return;
            sc.scrollTo({ top: sc.scrollHeight, behavior: "smooth" });
        });
        const update = () => {
            const sc = scroller();
            if (!sc) { btn.style.display = "none"; return; }
            const atBottom = sc.scrollHeight - sc.scrollTop - sc.clientHeight < 200;
            btn.style.display = atBottom ? "none" : "flex";
        };
        api.on(document, "scroll", update, true);
        api.dom.observe(update, { throttle: 300 });

        api.on(window, "keydown", e => {
            if (e.altKey && (e.key === "Home" || e.key === "ArrowUp" && e.ctrlKey)) {
                const sc = scroller(); if (!sc) return;
                e.preventDefault();
                sc.scrollTo({ top: 0, behavior: "smooth" });
                api.toast("Scrolling to the start… (keep waiting as older messages load)", "#4e5058", 2500);
            }
        }, true);
    },

    options(api) {
        return [api.ui.note("A round button appears bottom-right when you scroll up; click it to jump to the newest message. Alt+Home scrolls toward the very start of the chat.")];
    }
});
