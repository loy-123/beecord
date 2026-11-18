// Accent Color: recolor beecord's own UI accent (the panel, highlights, HUDs) to any color you like,
// live. Pick a preset or type a hex. Only restyles beecord — it doesn't touch Discord's own theme.
let applyAccent = null;

(window.beecord || window.blxstncord).definePlugin({
    id: "accent-color",
    name: "Accent Color",
    description: "Recolor beecord's accent (panel highlights, HUDs, toggles) to any color. Presets + custom hex. beecord-only, live.",
    author: "beecord",
    version: "1.0.0",
    category: "Look",
    enabledByDefault: false,
    webpack: false,

    start(api) {
        const style = api.addStyle("");
        const norm = hex => {
            let s = String(hex || "").trim();
            if (/^[0-9a-f]{6}$/i.test(s)) s = "#" + s;
            if (/^#[0-9a-f]{3}$/i.test(s)) s = "#" + s[1] + s[1] + s[2] + s[2] + s[3] + s[3];
            return /^#[0-9a-f]{6}$/i.test(s) ? s.toLowerCase() : null;
        };
        const rgb = hex => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
        applyAccent = () => {
            const hex = norm(api.settings.get("color", "#9dbfea")) || "#9dbfea";
            const [r, g, b] = rgb(hex);
            style.textContent = ":root{--ig-accent:" + hex + "!important;--ig-accent-rgb:" + r + "," + g + "," + b + "!important}";
        };
        applyAccent();
        api.cleanup(() => { applyAccent = null; });
    },

    options(api) {
        const h = api.ui.h;
        const PRESETS = [
            ["#9dbfea", "Blue"], ["#80d09c", "Mint"], ["#f2a9bc", "Pink"], ["#b69cf0", "Purple"],
            ["#e8c478", "Gold"], ["#f0888a", "Red"], ["#76d0d0", "Teal"], ["#e8ecf2", "White"]
        ];
        const current = () => String(api.settings.get("color", "#9dbfea")).toLowerCase();
        const set = hex => { api.settings.set("color", hex); if (applyAccent) applyAccent(); draw(); };

        const view = h("div");
        const draw = () => {
            const cur = current();
            const swatches = h("div", { style: "display:flex;flex-wrap:wrap;gap:8px;margin:4px 0 10px" },
                ...PRESETS.map(([hex, name]) => {
                    const on = hex === cur;
                    const sw = h("div", { title: name + " " + hex, style: "width:30px;height:30px;border-radius:8px;cursor:pointer;background:" + hex + ";" +
                        "box-shadow:" + (on ? "0 0 0 2px #0c0c0c,0 0 0 4px " + hex : "inset 0 0 0 1px rgba(255,255,255,.15)") + ";transition:transform .12s" });
                    sw.addEventListener("mouseenter", () => sw.style.transform = "scale(1.12)");
                    sw.addEventListener("mouseleave", () => sw.style.transform = "");
                    sw.addEventListener("click", () => set(hex));
                    return sw;
                }));
            const picker = h("input", { type: "color", value: /^#[0-9a-f]{6}$/i.test(cur) ? cur : "#9dbfea", style: "width:40px;height:32px;padding:0;border:1px solid var(--bc-line);border-radius:8px;background:transparent;cursor:pointer" });
            picker.addEventListener("input", () => set(picker.value));
            const hexIn = api.ui.input(cur, v => { const n = /^#?[0-9a-f]{6}$/i.test(String(v).trim()); if (n) set(String(v).trim().replace(/^#?/, "#")); }, "#9dbfea");
            hexIn.style.width = "110px";
            view.replaceChildren(
                api.ui.note("Recolors beecord's accent everywhere (panel, toggles, HUDs). Discord's own theme is unchanged."),
                h("div", { style: "font-size:10.5px;font-weight:700;letter-spacing:.04em;color:var(--ig-accent,#9dbfea);text-transform:uppercase;margin-bottom:6px" }, "Presets"),
                swatches,
                api.ui.row("Custom color", h("div", { style: "display:flex;gap:8px;align-items:center" }, picker, hexIn)));
        };
        draw();
        return [view];
    }
});
