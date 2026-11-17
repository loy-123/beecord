// Volume Mixer: set any user's volume individually, including above Discord's 200% limit, from a panel.
// Useful when one person is way too quiet (or too loud). Uses Discord's own volume control.
(window.beecord || window.blxstncord).definePlugin({
    id: "volume-mixer",
    name: "Volume Mixer",
    description: "Set each user's voice volume individually, past the 200% cap, from the plugin panel.",
    author: "beecord",
    version: "1.0.0",
    category: "Tools",
    enabledByDefault: false,
    webpack: true,

    start(api) {
        const actions = api.webpack.findByProps(["setLocalVolume"], "setLocalVolume");
        if (!actions) return false;
        this.__setVol = (id, vol) => { try { actions.setLocalVolume(id, Math.max(0, Math.min(500, vol)), "default"); return true; } catch (e) { api.log("setLocalVolume failed: " + (e && e.message || e)); return false; } };
        this.__media = api.stores && api.stores.get("MediaEngineStore");
        this.__getVol = id => { try { return this.__media && this.__media.getLocalVolume ? Math.round(this.__media.getLocalVolume(id)) : 100; } catch { return 100; } };
        this.__voice = api.stores && api.stores.get("VoiceStateStore");
        this.__sel = api.stores && api.stores.get("SelectedChannelStore");
        this.__users = api.stores && api.stores.get("UserStore");
        return true;
    },

    options(api) {
        const h = api.ui.h;
        if (!this.__setVol) return [api.ui.note("Discord's volume control wasn't found yet — join a voice call and reopen this.")];

        const slider = (id, name) => {
            const val = this.__getVol(id);
            const label = h("span", { style: "min-width:46px;text-align:right;font:600 12px var(--ig-font,ui-monospace,monospace);color:var(--ig-accent,#9dbfea)" }, val + "%");
            const s = h("input", { type: "range", min: "0", max: "500", step: "5" });
            s.value = String(val);
            s.style.cssText = "flex:1;accent-color:#9dbfea";
            s.addEventListener("input", () => { label.textContent = s.value + "%"; this.__setVol(id, Number(s.value)); });
            return h("div", { style: "display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid var(--ig-child-border,#161616)" },
                h("span", { style: "min-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12.5px" }, name), s, label);
        };

        const rows = [];
        // users in your current voice channel
        try {
            const chId = this.__sel && this.__sel.getVoiceChannelId && this.__sel.getVoiceChannelId();
            if (chId && this.__voice && this.__voice.getVoiceStatesForChannel) {
                const states = this.__voice.getVoiceStatesForChannel(chId) || {};
                const me = this.__users && this.__users.getCurrentUser && this.__users.getCurrentUser();
                for (const uid of Object.keys(states)) {
                    if (me && uid === me.id) continue;
                    let name = uid;
                    try { const u = this.__users.getUser(uid); if (u) name = u.global_name || u.username; } catch { }
                    rows.push(slider(uid, name));
                }
            }
        } catch (e) { api.log("vc list error: " + (e && e.message || e)); }

        // manual: set by user ID
        const idIn = api.ui.input("", () => { }, "user ID"); idIn.style.width = "180px";
        const volIn = api.ui.input(150, () => { }, "150", "number");
        const applyBtn = h("button", { type: "button", class: "fc-btn", style: "height:30px" }, "Set");
        applyBtn.addEventListener("click", () => {
            const id = (idIn.value || "").trim(), v = Math.round(Number(volIn.value) || 0);
            if (/^\d{15,}$/.test(id)) { this.__setVol(id, v); api.toast("Set volume for " + id + " to " + v + "%", "#80d09c", 2000); }
            else api.toast("Enter a valid user ID", "#e8c478", 2000);
        });

        return [
            rows.length ? api.ui.note("People in your current voice channel:") : api.ui.note("You're not in a voice channel right now — join one and reopen this to see sliders per person."),
            ...rows,
            api.ui.note("Or set by user ID (enable Developer Mode or use beecord's Copy IDs to get one):"),
            h("div", { style: "display:flex;align-items:center;gap:8px" }, idIn, volIn, h("span", { style: "color:var(--ig-secondary,#646b78)" }, "%"), applyBtn),
            api.ui.note("Range 0–500%. Values over 200% go past Discord's normal limit.")
        ];
    }
});
