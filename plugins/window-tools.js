// Window Tools: keep Discord above other windows and/or make it see-through (handy while gaming or watching a stream).
// Uses Electron window APIs through loader.js ("cmd:window:...").
(window.beecord || window.blxstncord).definePlugin({
    id: "window-tools",
    name: "Window Tools",
    description: "Always-on-top (Ctrl+Alt+T) and window transparency for the Discord window.",
    author: "beecord",
    version: "1.0.0",
    enabledByDefault: true,
    webpack: false,

    start(api) {
        const apply = () => {
            api.command("window:top:" + (api.settings.get("top", false) ? "on" : "off"));
            api.command("window:opacity:" + Math.round(Number(api.settings.get("opacity", 100)) || 100));
        };
        apply();
        this.__apply = apply;
        api.on(document, "keydown", e => {
            if (e.ctrlKey && e.altKey && !e.shiftKey && e.key.toLowerCase() === "t") {
                e.preventDefault();
                const v = !api.settings.get("top", false);
                api.settings.set("top", v);
                apply();
                api.toast(v ? "Always on top: ON" : "Always on top: OFF", v ? "#5865f2" : "#4e5058");
            }
        }, true);
        api.cleanup(() => { api.command("window:top:off"); api.command("window:opacity:100"); this.__apply = null; });
    },

    options(api) {
        const apply = () => { if (this.__apply) this.__apply(); };
        const label = api.ui.h("span", null, api.settings.get("opacity", 100) + "%");
        const slider = api.ui.h("input", { type: "range", min: "30", max: "100", step: "5" });
        slider.value = String(api.settings.get("opacity", 100));
        slider.style.cssText = "width:160px;accent-color:#5865f2";
        slider.addEventListener("input", () => { label.textContent = slider.value + "%"; api.settings.set("opacity", Number(slider.value)); apply(); });
        return [
            api.ui.row("Always on top (Ctrl+Alt+T)", api.ui.toggle(api.settings.get("top", false), v => { api.settings.set("top", v); apply(); })),
            api.ui.row("Window opacity", api.ui.h("div", { style: "display:flex;align-items:center;gap:10px" }, slider, label)),
            api.ui.note("Turning the plugin off puts the window back to normal.")
        ];
    }
});
