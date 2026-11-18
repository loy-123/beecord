// Passcode Lock: protect Discord behind a passcode. Lock from the beecord panel button,
// a keybind (default Ctrl+L), or automatically after you've been away. The lock screen
// covers Discord and blocks input until the right code is entered.
// Ported to beecord from PasscodeLock by arg0NNY (GPL-3.0) via the Nightcord port.
// Self-only and local: the passcode hash never leaves this machine (PBKDF2, stored in
// beecord's config). If anything ever gets stuck, run  window.__beecordPCLReset()  in the
// devtools console, or just toggle the plugin off.
(window.beecord || window.blxstncord).definePlugin({
    id: "passcode-lock",
    name: "Passcode Lock",
    description: "Protect Discord with a passcode. Lock with Ctrl+L, from the panel, or automatically after being away.",
    author: "arg0NNY (ported by beecord)",
    version: "1.0.0",
    category: "Privacy & Safety",
    enabledByDefault: false,
    webpack: true,

    start(api) {
        const subtle = window.crypto && window.crypto.subtle;
        if (!subtle) { api.log("Web Crypto not available — passcode lock disabled"); return; }

        // ---------- persisted state (beecord config, per plugin) ----------
        const S = api.settings;
        const getData = () => {
            const d = S.get("data", {});
            return (d && typeof d === "object") ? d : {};
        };
        const setData = patch => S.set("data", Object.assign({}, getData(), patch));

        // ---------- crypto (PBKDF2 / SHA-256) ----------
        const te = new TextEncoder();
        const hex = buf => Array.prototype.map.call(new Uint8Array(buf), x => ("00" + x.toString(16)).slice(-2)).join("");
        async function derive(code, saltHex, iterations) {
            const salt = Uint8Array.from(saltHex.match(/.{2}/g).map(h => parseInt(h, 16)));
            const base = await subtle.importKey("raw", te.encode(code), "PBKDF2", false, ["deriveBits"]);
            const bits = await subtle.deriveBits({ name: "PBKDF2", salt, iterations, hash: "SHA-256" }, base, 256);
            return hex(bits);
        }
        async function hashCode(code) {
            const saltHex = hex(crypto.getRandomValues(new Uint8Array(32)).buffer);
            const iterations = 150000;
            const hash = await derive(code, saltHex, iterations);
            return { hash, salt: saltHex, iterations };
        }
        async function checkCode(code, d) {
            try { return !!d.hash && (await derive(code, d.salt, d.iterations)) === d.hash; }
            catch { return false; }
        }

        // ---------- helpers ----------
        const codeType = () => S.get("codeType", "4-digit");
        const codeLen = () => { const t = codeType(); return t === "4-digit" ? 4 : t === "6-digit" ? 6 : -1; };
        const MAX_LEN = 15;

        const currentUser = () => {
            try { const US = api.stores.get("UserStore"); return US && US.getCurrentUser && US.getCurrentUser(); }
            catch { return null; }
        };
        const userAssets = () => {
            const u = currentUser();
            if (!u) return { avatar: "", name: "Discord" };
            let avatar;
            if (u.avatar) {
                const anim = String(u.avatar).startsWith("a_");
                avatar = "https://cdn.discordapp.com/avatars/" + u.id + "/" + u.avatar + (anim ? ".gif" : ".png") + "?size=128";
            } else {
                let idx = 0;
                try { idx = Number((BigInt(u.id) >> 22n) % 6n); } catch { idx = 0; }
                avatar = "https://cdn.discordapp.com/embed/avatars/" + idx + ".png";
            }
            return { avatar, name: u.globalName || u.username || "Discord" };
        };

        // ---------- styles ----------
        api.addStyle(`
.pcl-layout{position:fixed;inset:0;z-index:2147483600;display:flex;align-items:center;justify-content:center;overflow:hidden;font-family:var(--ig-font,"gg sans",ui-sans-serif,system-ui,sans-serif)}
.pcl-bg{position:absolute;border-radius:50%;background:rgba(10,11,15,.78);backdrop-filter:blur(22px) saturate(1.1);-webkit-backdrop-filter:blur(22px) saturate(1.1);transform:scale(0);transform-origin:center center;transition:transform .55s cubic-bezier(.22,1,.36,1);will-change:transform}
.pcl-layout.pcl-open .pcl-bg{transform:scale(1)}
.pcl-layout.pcl-full .pcl-bg{inset:0!important;width:100%!important;height:100%!important;border-radius:0!important;transform:none!important;transition:none!important}
.pcl-card{position:relative;z-index:1;display:flex;flex-direction:column;align-items:center;gap:12px;padding:8px;opacity:0;transform:translateY(10px) scale(.98);transition:opacity .4s ease .18s,transform .45s cubic-bezier(.22,1,.36,1) .18s}
.pcl-layout.pcl-open .pcl-card{opacity:1;transform:none}
.pcl-avatar{width:88px;height:88px;border-radius:50%;background-size:cover;background-position:center;background-color:#1e1f24;box-shadow:0 8px 34px rgba(0,0,0,.5),0 0 0 2px rgba(255,255,255,.06)}
.pcl-name{margin:2px 0 0;font-size:20px;font-weight:700;color:#fff;letter-spacing:.2px}
.pcl-sub{margin:0;font-size:13.5px;color:#b5bac1;white-space:pre-line;text-align:center;max-width:320px}
.pcl-inputwrap{display:flex;align-items:center;gap:6px;margin-top:6px;padding:0 6px 0 12px;height:46px;width:min(300px,82vw);border-radius:12px;background:rgba(0,0,0,.35);border:1px solid var(--ig-border,rgba(255,255,255,.1));transition:border-color .2s,box-shadow .2s}
.pcl-inputwrap:focus-within{border-color:var(--ig-accent,#9dbfea);box-shadow:0 0 0 3px color-mix(in srgb,var(--ig-accent,#9dbfea) 22%,transparent)}
.pcl-inputwrap.pcl-err{animation:pcl-shake .5s both;border-color:#f23f43!important;box-shadow:0 0 0 3px rgba(242,63,67,.22)!important}
.pcl-lockico{flex:none;color:#9aa0a8}
.pcl-input{flex:1;min-width:0;height:100%;border:0;outline:0;background:transparent;color:#fff;font-size:17px;letter-spacing:4px;font-family:var(--ig-font,ui-monospace,monospace)}
.pcl-input::placeholder{letter-spacing:normal;color:#6a6f78}
.pcl-input:disabled{opacity:.5}
.pcl-submit{flex:none;width:34px;height:34px;display:flex;align-items:center;justify-content:center;border:0;border-radius:9px;cursor:pointer;background:var(--ig-accent,#9dbfea);color:#0b0d12;transition:filter .15s,transform .1s}
.pcl-submit:hover{filter:brightness(1.08)}
.pcl-submit:active{transform:scale(.94)}
.pcl-delay{display:flex;align-items:center;gap:6px;max-width:300px;text-align:center;font-size:12.5px;color:#f0b232;white-space:pre-line;opacity:0;height:0;overflow:hidden;transition:opacity .25s}
.pcl-delay.pcl-on{opacity:1;height:auto;margin-top:2px}
@keyframes pcl-shake{10%,90%{transform:translateX(-2px)}20%,80%{transform:translateX(4px)}30%,50%,70%{transform:translateX(-7px)}40%,60%{transform:translateX(7px)}}
`);

        const LOCK_SVG = '<svg viewBox="0 0 24 24" width="15" height="15"><path fill="currentColor" d="M19,10h-1V7.69c0-3.16-2.57-5.72-5.72-5.72H11.8C8.66,1.97,6,4.62,6,7.77V10H5c-0.55,0-1,0.45-1,1v8c0,1.65,1.35,3,3,3h10c1.65,0,3-1.35,3-3v-8C20,10.45,19.55,10,19,10z M8,7.77c0-2.06,1.74-3.8,3.8-3.8h0.48c2.05,0,3.72,1.67,3.72,3.72V10H8V7.77z M12,18c-0.83,0-1.5-0.67-1.5-1.5S11.17,15,12,15s1.5,0.67,1.5,1.5S12.83,18,12,18z"/></svg>';
        const CHECK_SVG = '<svg viewBox="0 0 24 24" width="17" height="17"><path fill="currentColor" d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z"/></svg>';
        const CLOCK_SVG = '<svg viewBox="0 0 24 24" width="15" height="15" style="flex:none"><path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>';

        // ---------- lock orchestration ----------
        let isLocked = false;
        let overlay = null;        // the .pcl-layout element
        let watchdog = null;
        let focusGuard = null;
        let delayTimer = null;
        let deafened = false;

        const getDeaf = () => {
            try { const MES = api.stores.get("MediaEngineStore"); return MES && MES.isSelfDeaf && MES.isSelfDeaf(); } catch { return false; }
        };
        const toggleDeaf = () => {
            try { const m = api.webpack.findByProps(["toggleSelfDeaf"], "toggleSelfDeaf"); if (m && m.toggleSelfDeaf) { m.toggleSelfDeaf(); return true; } } catch { }
            return false;
        };
        // Log the current account out of Discord (used by the "log out on wrong passcode" option).
        const doLogout = () => {
            try { const m = api.webpack.findByProps(["logout"], "logout"); if (m && typeof m.logout === "function") { m.logout(); return true; } } catch { }
            return false;
        };

        // Always-safe, idempotent teardown. Exposed on window as a last-resort hatch.
        function forceReset(reason) {
            if (reason) api.log("force reset: " + reason);
            clearTimeout(watchdog); watchdog = null;
            clearInterval(delayTimer); delayTimer = null;
            if (focusGuard) { try { document.removeEventListener("focusin", focusGuard, true); } catch { } focusGuard = null; }
            try { if (overlay && overlay.parentNode) overlay.remove(); } catch { }
            try { document.querySelectorAll(".pcl-layout").forEach(el => el.remove()); } catch { }
            overlay = null;
            isLocked = false;
            setData({ locked: false });
        }
        window.__beecordPCLReset = () => forceReset("manual window.__beecordPCLReset()");
        api.cleanup(() => { try { delete window.__beecordPCLReset; } catch { } });

        // Build + show an overlay. type: "default" (unlock) | "editor" (set/confirm new code)
        function openLocker(type, button, onDone) {
            if (overlay) return;
            const { avatar, name } = userAssets();
            const len = codeLen();
            let confirmStage = false, newCode = "";

            const h = api.ui.h;
            overlay = h("div", { class: "pcl-layout" });
            const bg = h("div", { class: "pcl-bg" });
            const card = h("div", { class: "pcl-card" });
            const av = h("div", { class: "pcl-avatar" });
            av.style.backgroundImage = "url('" + avatar.replace(/'/g, "%27") + "')";
            const nm = h("div", { class: "pcl-name" }, name);
            const sub = h("div", { class: "pcl-sub" });
            const wrap = h("div", { class: "pcl-inputwrap" });
            const lk = h("span", { class: "pcl-lockico" }); lk.innerHTML = LOCK_SVG;
            const input = h("input", { class: "pcl-input", type: "password", placeholder: "Passcode", autocomplete: "off", spellcheck: "false" });
            if (len > 0) input.setAttribute("inputmode", "numeric");
            input.setAttribute("maxlength", String(MAX_LEN));
            const submit = h("button", { class: "pcl-submit", type: "button", title: "Submit" }); submit.innerHTML = CHECK_SVG;
            const delay = h("div", { class: "pcl-delay" });
            const delayTxt = h("span");
            delay.innerHTML = CLOCK_SVG; delay.appendChild(delayTxt);

            wrap.append(lk, input, submit);
            card.append(av, nm, sub, wrap, delay);
            overlay.append(bg, card);

            const updateTitle = () => {
                sub.textContent = type === "editor"
                    ? (confirmStage ? "Re-enter your new passcode" : "Choose a new passcode")
                    : "Enter your Discord passcode";
            };
            updateTitle();

            // position + size the reveal circle on the trigger button
            const rect = (button && document.body.contains(button)) ? button.getBoundingClientRect()
                : { top: innerHeight / 2, left: innerWidth / 2, width: 0, height: 0 };
            const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
            const radius = Math.hypot(Math.max(cx, innerWidth - cx), Math.max(cy, innerHeight - cy)) + 4;
            bg.style.width = bg.style.height = (radius * 2) + "px";
            bg.style.left = (cx - radius) + "px";
            bg.style.top = (cy - radius) + "px";

            document.body.appendChild(overlay);
            // kick the entrance on the next frame
            requestAnimationFrame(() => { try { overlay.classList.add("pcl-open"); } catch { } });
            // once the circle has covered the screen, drop the rounded clip so nothing peeks through
            setTimeout(() => { try { overlay && overlay.classList.add("pcl-full"); } catch { } }, 620);

            setTimeout(() => { try { input.focus(); } catch { } }, 30);

            // keep focus inside the overlay so the rest of Discord can't be typed into
            focusGuard = e => {
                if (!overlay || overlay.contains(e.target)) return;
                e.stopImmediatePropagation();
                try { input.focus(); } catch { }
            };
            document.addEventListener("focusin", focusGuard, true);

            let done = false;
            const finish = (success) => {
                if (done) return; done = true;
                clearInterval(delayTimer); delayTimer = null;
                if (focusGuard) { document.removeEventListener("focusin", focusGuard, true); focusGuard = null; }
                // closing animation: collapse the reveal back toward the button
                try {
                    overlay.classList.remove("pcl-full");
                    card.style.opacity = "0";
                    overlay.classList.remove("pcl-open");
                } catch { }
                const ov = overlay; overlay = null;
                setTimeout(() => {
                    try { ov && ov.remove(); } catch { }
                    try { onDone(success, type === "editor" ? newCode : undefined); } catch (e) { api.log("onDone error: " + (e && e.message)); }
                }, 420);
            };

            // failure feedback + backoff
            const refreshDelay = () => {
                const d = getData();
                if (d.delayUntil && Date.now() < d.delayUntil) {
                    const left = Math.ceil((d.delayUntil - Date.now()) / 1000);
                    delay.classList.add("pcl-on");
                    delayTxt.textContent = "Too many tries. Try again in " + left + (left === 1 ? " second." : " seconds.");
                    input.disabled = true;
                    return true;
                }
                delay.classList.remove("pcl-on");
                input.disabled = false;
                return false;
            };
            const fail = () => {
                input.value = "";
                wrap.classList.remove("pcl-err"); void wrap.offsetWidth; wrap.classList.add("pcl-err");
                setTimeout(() => wrap.classList.remove("pcl-err"), 600);
                if (type !== "default") return;
                const d = getData();
                const attempts = (d.attempts || 0) + 1;
                const patch = { attempts };
                if (attempts >= 3) patch.delayUntil = Date.now() + Math.min(30000, 5000 * (attempts - 2));
                setData(patch);
                refreshDelay();
                // optional: log out of Discord once wrong attempts reach the chosen threshold
                const logoutAfter = Number(S.get("logoutAfter", 0));
                if (logoutAfter > 0 && attempts >= logoutAfter) {
                    input.disabled = true;
                    delay.classList.add("pcl-on");
                    delayTxt.textContent = "Wrong passcode — logging out of Discord…";
                    const ok = doLogout();
                    // only clear the lock if logout actually fired (page will navigate to login);
                    // if the logout module wasn't found, stay locked rather than granting access.
                    if (ok) setData({ attempts: 0, delayUntil: null, locked: false });
                    else { delayTxt.textContent = "Couldn't log out automatically."; setTimeout(() => refreshDelay(), 2500); }
                }
            };

            const accept = async (code) => {
                code = (code != null ? code : input.value) || "";
                if (code === "" || input.disabled) return;
                try {
                    if (type === "editor") {
                        if (!confirmStage) { newCode = code; input.value = ""; confirmStage = true; updateTitle(); }
                        else if (code !== newCode) { fail(); }
                        else { finish(true); }
                        return;
                    }
                    const d = getData();
                    if (await checkCode(code, d)) finish(true);
                    else fail();
                } catch (e) { api.log("accept error: " + (e && e.message)); fail(); }
            };

            input.addEventListener("input", () => {
                if (len > 0 && input.value.length >= len) accept(input.value);
            });
            input.addEventListener("keydown", e => {
                e.stopPropagation();
                if (e.key === "Enter") { e.preventDefault(); accept(input.value); }
                if (e.key === "Escape" && type === "editor") { e.preventDefault(); finish(false); }
            });
            input.addEventListener("keyup", e => e.stopPropagation());
            submit.addEventListener("click", () => accept(input.value));

            delayTimer = setInterval(refreshDelay, 500);
            refreshDelay();

            // watchdog: an overlay should never sit open forever. For the editor,
            // auto-cancel after 60s. For a real lock we never auto-unlock (that would
            // defeat the point) — but forceReset stays reachable from the console.
            clearTimeout(watchdog);
            if (type === "editor") watchdog = setTimeout(() => finish(false), 60000);
        }

        function lock(button) {
            if (isLocked || overlay) return;
            try {
                deafened = false;
                if (S.get("deafenWhileLocked", false) && !getDeaf()) deafened = toggleDeaf();
                openLocker("default", button || document.body, () => {
                    isLocked = false;
                    setData({ locked: false, attempts: 0, delayUntil: null });
                    if (deafened) { toggleDeaf(); deafened = false; }
                });
                // only commit the locked flag once the overlay actually opened
                isLocked = true;
                setData({ locked: true });
            } catch (e) {
                api.log("lock() failed: " + (e && e.message));
                forceReset("lock() threw");
                api.toast("Passcode Lock couldn't open — see console", "#f23f43", 2600);
            }
        }
        this.__lock = lock;
        this.__openEditor = (onSaved) => {
            if (overlay) return;
            openLocker("editor", document.body, (success, code) => {
                if (success && code) {
                    hashCode(code).then(r => {
                        setData({ hash: r.hash, salt: r.salt, iterations: r.iterations });
                        api.toast("Passcode updated", "#80d09c", 1800);
                        if (onSaved) onSaved();
                    }).catch(e => { api.log("hashCode failed: " + (e && e.message)); api.toast("Couldn't save passcode", "#f23f43", 2200); });
                }
            });
        };
        this.__hasCode = () => !!getData().hash;
        this.__clearCode = () => { setData({ hash: null, salt: null, iterations: null, locked: false }); };

        // ---------- auto-lock on inactivity ----------
        let autolock = null;
        const resetAutolock = () => {
            clearTimeout(autolock);
            const secs = Number(S.get("autolockSeconds", 0));
            if (!secs) return;
            autolock = setTimeout(() => lock(document.body), secs * 1000);
        };
        let lastActivity = 0;
        const activity = () => {
            const now = Date.now();
            if (now - lastActivity < 2000) return;
            lastActivity = now;
            if (!isLocked) resetAutolock();
        };
        api.on(window, "mousemove", activity);
        api.on(window, "mousedown", activity);
        api.on(window, "keydown", activity);
        api.cleanup(() => clearTimeout(autolock));
        resetAutolock();

        // ---------- keybind ----------
        const parseKeybind = str => String(str || "control+l").toLowerCase().split("+").map(k => k.trim()).filter(Boolean);
        api.on(window, "keydown", e => {
            if (e.repeat || ["Control", "Shift", "Alt", "Meta"].includes(e.key)) return;
            const combo = parseKeybind(S.get("keybind", "control+l"));
            const pressed = [];
            if (e.ctrlKey) pressed.push("control");
            if (e.shiftKey) pressed.push("shift");
            if (e.altKey) pressed.push("alt");
            const key = e.key.toLowerCase();
            if (!["control", "shift", "alt"].includes(key)) pressed.push(key);
            if (combo.slice().sort().join("|") === pressed.slice().sort().join("|")) {
                e.preventDefault(); e.stopPropagation();
                if (this.__hasCode()) lock(document.body);
                else api.toast("Set a passcode first (beecord → Passcode Lock)", "#e8c478", 2600);
            }
        }, true);

        // ---------- hide notification content while locked ----------
        try {
            const NM = api.webpack.findByProps(["showNotification"], "showNotification", "hasPermission");
            if (NM && typeof NM.showNotification === "function" && api.patch) {
                api.patch(NM, "showNotification", orig => function (...args) {
                    if (isLocked && S.get("hideNotifications", true)) {
                        args[1] = "New notification";
                        args[2] = "You have a new notification.";
                        if (args[4] && args[4].onClick) args[4].onClick = () => { };
                    }
                    return orig.apply(this, args);
                });
            }
        } catch (e) { api.log("notification patch skipped: " + (e && e.message)); }

        // ---------- lock on startup ----------
        const d0 = getData();
        if (d0.hash && (S.get("lockOnStartup", true) || d0.locked)) {
            setTimeout(() => {
                lock(document.body);
                setTimeout(() => { if (!isLocked) lock(document.body); }, 2500);  // retry once if modules weren't ready
            }, 500);
        }

        api.cleanup(() => forceReset("plugin stop"));
        api.log("Passcode Lock started" + (d0.hash ? "" : " (no passcode set yet)"));
        return true;
    },

    options(api) {
        const h = api.ui.h;
        const self = this;
        const has = () => self.__hasCode && self.__hasCode();

        const row = h("div", { style: "display:flex;gap:10px;flex-wrap:wrap;margin:2px 0 4px" });
        const setBtn = h("button", { type: "button", class: "fc-btn", style: "height:32px" }, has() ? "Change passcode" : "Set up passcode");
        const lockBtn = h("button", { type: "button", class: "fc-btn sec", style: "height:32px" }, "Lock now");
        const clearBtn = h("button", { type: "button", class: "fc-btn sec", style: "height:32px" }, "Remove passcode");
        const refresh = () => { setBtn.textContent = has() ? "Change passcode" : "Set up passcode"; clearBtn.style.display = has() ? "" : "none"; };
        setBtn.addEventListener("click", () => { if (self.__openEditor) self.__openEditor(refresh); });
        lockBtn.addEventListener("click", () => {
            if (!has()) { api.toast("Set a passcode first", "#e8c478", 2200); return; }
            if (self.__lock) self.__lock(lockBtn);
        });
        clearBtn.addEventListener("click", async () => {
            if (!has()) return;
            const ok = api.ui.confirm ? await api.ui.confirm("Remove passcode?", "Discord will no longer be protected by a passcode.", "Remove", "Keep") : true;
            if (ok && self.__clearCode) { self.__clearCode(); api.toast("Passcode removed", "#9dbfea", 1800); refresh(); }
        });
        refresh();
        row.append(setBtn, lockBtn, clearBtn);

        return [
            row,
            api.ui.note("Choose a passcode, then lock Discord with Ctrl+L (configurable), the ‘Lock now’ button, or automatically after being away. The passcode is hashed (PBKDF2) and never leaves this computer. If a lock screen ever gets stuck, run window.__beecordPCLReset() in DevTools."),
            api.ui.row("Code type", api.ui.select([["4-digit", "4-digit numeric"], ["6-digit", "6-digit numeric"], ["custom-numeric", "Custom length (press Enter)"]],
                api.settings.get("codeType", "4-digit"), v => api.settings.set("codeType", v))),
            api.ui.row("Lock keybind", api.ui.input(api.settings.get("keybind", "control+l"), v => api.settings.set("keybind", String(v).trim() || "control+l"), "control+l")),
            api.ui.row("Auto-lock after being away for", api.ui.select([["0", "Disabled"], ["60", "1 minute"], ["300", "5 minutes"], ["3600", "1 hour"], ["18000", "5 hours"]],
                String(api.settings.get("autolockSeconds", 0)), v => api.settings.set("autolockSeconds", Number(v)))),
            api.ui.row("Lock on startup", api.ui.toggle(api.settings.get("lockOnStartup", true), v => api.settings.set("lockOnStartup", v))),
            api.ui.row("Hide notification content while locked", api.ui.toggle(api.settings.get("hideNotifications", true), v => api.settings.set("hideNotifications", v))),
            api.ui.row("Deafen while locked", api.ui.toggle(api.settings.get("deafenWhileLocked", false), v => api.settings.set("deafenWhileLocked", v))),
            api.ui.row("Log out of Discord on wrong passcode", api.ui.select([["0", "Never"], ["1", "After 1 wrong try"], ["2", "After 2 wrong tries"], ["3", "After 3 wrong tries"]],
                String(api.settings.get("logoutAfter", 0)), v => api.settings.set("logoutAfter", Number(v)))),
            api.ui.note("If set, entering the wrong passcode that many times logs this account out of Discord (you'll have to log back in with your email/password). Leave on ‘Never’ to disable.")
        ];
    }
});
