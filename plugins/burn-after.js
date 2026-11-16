// Burn After: your own messages delete themselves after a timer.
//   "!burn 30s text"  "!burn 5m text"  "!burn 1h text"  "!burn 2d text"   (or "!b 5m text")  -> that message only
//   or set an automatic timer for all your messages (everywhere / DMs only).
// The timer list is saved, so deletes still happen after a Discord restart (when Discord is open again).
// Deleting uses Discord's normal API with your session; the login token is read from Discord's own requests,
// kept in memory only and never stored or sent anywhere else.
(window.beecord || window.blxstncord).definePlugin({
    id: "burn-after",
    name: "Burn After",
    description: "Self-destructing messages: \"!burn 5m text\" deletes that message after 5 minutes, or set a timer for all your messages.",
    author: "beecord",
    version: "1.0.0",
    enabledByDefault: true,
    webpack: false,

    start(api) {
        let token = null;
        const grab = v => { if (typeof v === "string" && v.length > 30 && !/^(bot|bearer)\s/i.test(v)) token = v; };
        api.patch(XMLHttpRequest.prototype, "setRequestHeader", orig => function (k, v) {
            try { if (String(k).toLowerCase() === "authorization") grab(v); } catch { }
            return orig.call(this, k, v);
        });
        api.patch(window, "fetch", orig => function (input, init) {
            try {
                const hd = init && init.headers;
                if (hd) grab(typeof hd.get === "function" ? hd.get("Authorization") : (hd.Authorization || hd.authorization));
            } catch { }
            return orig.call(this, input, init);
        });

        const UNITS = { s: 1e3, m: 6e4, h: 36e5, d: 864e5 };
        const parseDur = s => { const m = /^(\d{1,4})\s*([smhd])$/i.exec(String(s).trim()); return m ? Math.min(Number(m[1]) * UNITS[m[2].toLowerCase()], 30 * 864e5) : 0; };
        const fmt = ms => ms >= 864e5 ? Math.round(ms / 864e5) + "d" : ms >= 36e5 ? Math.round(ms / 36e5) + "h" : ms >= 6e4 ? Math.round(ms / 6e4) + "m" : Math.round(ms / 1e3) + "s";
        const queue = () => { const q = api.settings.get("queue", []); return Array.isArray(q) ? q : []; };
        const saveQ = q => api.settings.set("queue", q);

        // flame marker on messages waiting to burn
        api.addStyle(`li[data-bc-burn] [id^="message-content-"]::after{content:" 🔥 " attr(data-bc-burn-left);font-size:11px;opacity:.7;white-space:nowrap}`);
        const markAll = () => {
            const now = Date.now();
            const byId = new Map(queue().map(x => [x.m, x.at]));
            for (const li of document.querySelectorAll("li[data-bc-burn]")) {
                const id = li.id.split("-").pop();
                if (!byId.has(id)) { li.removeAttribute("data-bc-burn"); li.querySelector('[id^="message-content-"]')?.removeAttribute("data-bc-burn-left"); }
            }
            for (const [m, at] of byId) {
                const li = document.querySelector('li[id$="-' + m + '"][id^="chat-messages-"]');
                if (!li) continue;
                li.setAttribute("data-bc-burn", "1");
                const c = li.querySelector('[id^="message-content-"]');
                if (c) c.setAttribute("data-bc-burn-left", fmt(Math.max(0, at - now)));
            }
        };

        let busy = false;
        const tick = async () => {
            markAll();
            if (busy || !token) return;
            const q = queue();
            const due = q.filter(x => x.at <= Date.now());
            if (!due.length) return;
            busy = true;
            try {
                const x = due[0];
                const res = await fetch("/api/v9/channels/" + x.c + "/messages/" + x.m, { method: "DELETE", headers: { Authorization: token } });
                if (res.status === 429) {
                    let wait = 5000; try { wait = Math.ceil((await res.json()).retry_after * 1000) + 250; } catch { }
                    saveQ(queue().map(y => y.m === x.m ? Object.assign({}, y, { at: Date.now() + wait }) : y));
                } else {
                    if (!res.ok && res.status !== 404 && res.status !== 403) {
                        x.tries = (x.tries || 0) + 1;
                        if (x.tries < 5) { saveQ(queue().map(y => y.m === x.m ? Object.assign({}, y, { at: Date.now() + 30000, tries: x.tries }) : y)); return; }
                    }
                    saveQ(queue().filter(y => y.m !== x.m));
                    api.log("burned message " + x.m + " (" + res.status + ")");
                }
            } catch (e) { api.log("burn failed: " + (e && e.message || e)); }
            finally { busy = false; }
        };
        const timer = setInterval(tick, 1200);
        api.cleanup(() => { clearInterval(timer); for (const li of document.querySelectorAll("li[data-bc-burn]")) li.removeAttribute("data-bc-burn"); });

        api.messages.onSend((msg, ctx) => {
            if (ctx.edit) return;
            let ms = 0;
            if (typeof msg.content === "string") {
                const m = /^!(?:burn|b)\s+(\d{1,4}\s*[smhd])\b\s*/i.exec(msg.content);
                if (m) { ms = parseDur(m[1]); msg.content = msg.content.slice(m[0].length); }
            }
            if (!ms) {
                const auto = api.settings.get("auto", "off");
                const isDm = /^\/channels\/@me\//.test(location.pathname);
                if (auto === "all" || (auto === "dms" && isDm)) ms = parseDur(api.settings.get("autoTime", "1h"));
            }
            if (!ms) return;
            ctx.onSent(sent => {
                saveQ(queue().concat([{ c: sent.channel_id || ctx.channelId, m: sent.id, at: Date.now() + ms }]));
                api.toast("🔥 Self-destructs in " + fmt(ms), "#e8590c", 2000);
                markAll();
            });
            return msg;
        }, 40);
        this.__queue = queue;
        this.__clear = () => saveQ([]);
    },

    options(api) {
        const n = this.__queue ? this.__queue().length : 0;
        const clearBtn = api.ui.h("button", { type: "button", class: "fc-btn sec", style: "height:32px" }, "Cancel all timers");
        clearBtn.addEventListener("click", () => { if (this.__clear) this.__clear(); clearBtn.textContent = "Cancelled"; });
        return [
            api.ui.row("Automatic timer for all my messages", api.ui.select([["off", "Off (only !burn)"], ["dms", "In DMs"], ["all", "Everywhere"]],
                api.settings.get("auto", "off"), v => api.settings.set("auto", v))),
            api.ui.row("Automatic timer length (30s / 10m / 2h / 1d)", api.ui.input(api.settings.get("autoTime", "1h"), v => api.settings.set("autoTime", String(v).trim()), "1h")),
            api.ui.row(n + " message(s) waiting to burn", clearBtn),
            api.ui.note("One message: start it with \"!burn 5m \" (s, m, h, d; max 30 days). Deletes only happen while Discord is open; " +
                "if it was closed, overdue messages are deleted when you open it again. Others may still have seen, screenshotted or logged the message.")
        ];
    }
});
