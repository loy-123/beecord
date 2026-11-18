// Spotify Controls: a now-playing card above your user bar (mic / headphones) with play, pause, next, previous
// and a clickable progress bar. Works with the Spotify DESKTOP app on Windows through the Windows media controls
// (loader.js runs media.ps1 for it while this plugin is on). No Spotify login or API key needed.
let refreshSpotify = null;

(window.beecord || window.blxstncord).definePlugin({
    id: "spotify",
    name: "Spotify Controls",
    description: "Now-playing card above your user bar: play/pause, next, previous, shuffle, repeat/loop, volume, progress and album cover.",
    author: "beecord",
    version: "1.3.1",
    enabledByDefault: true,
    webpack: false,

    start(api) {
        const { h } = api.ui;
        api.log("Spotify Controls loaded (waveform seek bar)");
        const NS = "http://www.w3.org/2000/svg";
        const PATH = {
            note: "M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z",
            prev: "M6 6h2v12H6zm3.5 6 8.5 6V6z",
            next: "M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z",
            play: "M8 5v14l11-7z",
            pause: "M6 19h4V5H6v14zm8-14v14h4V5h-4z",
            shuffle: "M10.59 9.17 5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z",
            repeat: "M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z",
            repeatOne: "M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4zm-4-2V9h-1l-2 1v1h1.5v4H13z",
            volUp: "M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z",
            volDown: "M18.5 12A4.5 4.5 0 0 0 16 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02zM5 9v6h4l5 5V4L9 9H5z",
            volOff: "M16.5 12A4.5 4.5 0 0 0 14 7.97v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51A8.796 8.796 0 0 0 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3 3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06a8.99 8.99 0 0 0 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4 9.91 6.09 12 8.18V4z"
        };
        const ico = d => {
            const s = document.createElementNS(NS, "svg");
            s.setAttribute("viewBox", "0 0 24 24");
            const p = document.createElementNS(NS, "path");
            p.setAttribute("d", d);
            s.append(p);
            return s;
        };
        const send = c => console.log("[beecord] cmd:media:" + c);
        const fmt = ms => {
            const t = Math.max(0, Math.floor(ms / 1000));
            return Math.floor(t / 60) + ":" + String(t % 60).padStart(2, "0");
        };

        // ---------- state ----------
        let st = { running: false, playing: false, title: "", artist: "", pos: 0, dur: 0, key: "", shuffle: false, repeat: "none", volume: null, muted: false, at: performance.now() };
        let art = { key: null, src: "" };
        let holdVolUntil = 0;    // same for the volume slider
        let holdModeUntil = 0;   // same for shuffle / repeat
        let holdUntil = 0;   // ignore the play/pause state from Windows for a moment after a click (we already show the new state)

        // ---------- styles ----------
        api.addStyle(`
        .bsp-card{--ac:#9dbfea;position:relative;overflow:hidden;margin:8px 8px 0;padding:10px 12px;border-radius:8px;box-sizing:border-box;
            background:var(--background-surface-high,var(--background-secondary-alt,rgba(127,127,127,.14)));border:1px solid var(--border-subtle,rgba(255,255,255,.07));color:var(--text-default,var(--text-normal,#dbdee1));
            font-family:var(--font-primary,"gg sans","Noto Sans",sans-serif);user-select:none;animation:bsp-in .4s cubic-bezier(.2,.7,.2,1) backwards;
            transition:padding .22s ease,margin .22s ease}
        .bsp-roll-btn{position:absolute;top:2px;left:50%;transform:translateX(-50%);width:38px;height:14px;border-radius:7px;
            display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,.45);
            background:rgba(255,255,255,.07);transition:background .18s,color .18s,transform .2s;z-index:10;cursor:pointer}
        .bsp-roll-btn:hover{background:rgba(255,255,255,.18);color:#fff;transform:translateX(-50%) scale(1.06)}
        .bsp-roll-svg{width:13px;height:13px;fill:currentColor;transition:transform .25s cubic-bezier(.3,1.5,.5,1)}
        .bsp-card.bsp-collapsed .bsp-roll-svg{transform:rotate(180deg)}
        .bsp-card.bsp-collapsed{padding:6px 10px 6px 10px;margin-top:4px;cursor:pointer}
        /* collapsible body: driven by the Web Animations API in JS (see applyCollapsed), so it glides even
           when the OS has "reduce motion" on, which would otherwise kill CSS transitions below. */
        .bsp-body{overflow:hidden;height:auto;opacity:1;contain:layout;will-change:height}
        .bsp-body-inner{display:flex;flex-direction:column;min-height:0}
        .bsp-card.bsp-collapsed .bsp-row{gap:8px;padding-top:6px}
        .bsp-card.bsp-collapsed .bsp-art{width:24px;height:24px;border-radius:5px}
        /* while collapsed, freeze the inner animations so they don't relayout/burn CPU behind the hidden panel */
        .bsp-card.bsp-collapsed .bsp-wave i,
        .bsp-card.bsp-collapsed .bsp-vw.lit i,
        .bsp-card.bsp-collapsed .bsp-eq i,
        .bsp-card.bsp-collapsed .bsp-art,
        .bsp-card.bsp-collapsed .bsp-marq.scroll .bsp-title,
        .bsp-card.bsp-collapsed .bsp-btn.main::before{animation-play-state:paused!important}
        .bsp-card.bsp-collapsed .bsp-art svg{width:13px;height:13px}
        .bsp-card.bsp-collapsed .bsp-marq{font-size:12px;line-height:15px}
        .bsp-card.bsp-collapsed .bsp-artist{font-size:10.5px;line-height:13px}
        .bsp-card.bsp-float{position:fixed;left:8px;bottom:72px;width:232px;margin:0;z-index:120;background:var(--background-base-low,var(--background-base-lower,#111));border-color:var(--border-subtle,#202020);box-shadow:0 8px 28px rgba(0,0,0,.5)}
        .bsp-card *{box-sizing:border-box}
        :where(.bsp-card) button{all:unset;box-sizing:border-box;cursor:pointer}
        .bsp-card .bsp-btn:focus-visible{outline:2px solid var(--ac);outline-offset:2px}
        .bsp-bg{position:absolute;inset:-24px;background-size:cover;background-position:center;filter:blur(26px) saturate(1.5);opacity:.38;pointer-events:none;transition:opacity .5s}
        .bsp-card.noart .bsp-bg{opacity:0}
        .bsp-row{position:relative;display:flex;align-items:center;gap:10px;transition:gap .28s ease,padding .28s ease}
        .bsp-art{width:44px;height:44px;border-radius:8px;flex:none;display:flex;align-items:center;justify-content:center;color:var(--ac);
            background:rgba(127,127,127,.28) center/cover no-repeat;box-shadow:0 4px 14px rgba(0,0,0,.35);
            transition:transform .3s cubic-bezier(.3,1.5,.5,1),width .3s cubic-bezier(.33,0,.2,1),height .3s cubic-bezier(.33,0,.2,1),border-radius .3s ease}
        .bsp-art svg{width:22px;height:22px;fill:currentColor}
        .bsp-card:not(.noart) .bsp-art svg{display:none}
        .bsp-card.playing .bsp-art{animation:bsp-pulse 3.2s ease-in-out infinite}
        .bsp-text{flex:1;min-width:0}
        .bsp-marq{overflow:hidden;white-space:nowrap;font-weight:700;font-size:13.5px;line-height:18px;color:var(--header-primary,#f2f3f5);transition:font-size .26s ease,line-height .26s ease}
        .bsp-title{display:inline-block}
        .bsp-marq.scroll .bsp-title{animation:bsp-marq var(--dur,8s) ease-in-out infinite alternate}
        .bsp-artist{overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font-size:12px;line-height:16px;color:var(--text-muted,#949ba4);transition:font-size .26s ease,line-height .26s ease}
        .bsp-eq{display:flex;align-items:flex-end;gap:2px;width:15px;height:14px;flex:none;opacity:.9}
        .bsp-eq i{flex:1;height:22%;border-radius:1px;background:var(--ac);transition:height .3s}
        .bsp-card.playing .bsp-eq i{animation:bsp-eq .9s ease-in-out infinite alternate}
        .bsp-card.playing .bsp-eq i:nth-child(2){animation-duration:.65s;animation-delay:-.2s}
        .bsp-card.playing .bsp-eq i:nth-child(3){animation-duration:1.1s;animation-delay:-.45s}
        .bsp-card.playing .bsp-eq i:nth-child(4){animation-duration:.8s;animation-delay:-.1s}
        .bsp-ctl{position:relative;display:flex;align-items:center;justify-content:center;gap:8px;margin-top:8px}
        .bsp-btn{position:relative;width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:var(--header-primary,#f2f3f5);
            background:rgba(255,255,255,.05);box-shadow:inset 0 0 0 1px rgba(255,255,255,.06);
            transition:background .2s,box-shadow .2s,transform .2s cubic-bezier(.3,1.5,.5,1),color .2s,opacity .2s}
        .bsp-btn:hover{background:rgba(255,255,255,.16);box-shadow:inset 0 0 0 1px rgba(255,255,255,.18),0 4px 12px rgba(0,0,0,.28);transform:translateY(-1px) scale(1.1)}
        .bsp-btn:active{transform:scale(.88);transition-duration:.08s}
        .bsp-btn svg{width:20px;height:20px;fill:currentColor;animation:bsp-pop .32s cubic-bezier(.3,1.7,.5,1);transition:transform .22s cubic-bezier(.3,1.5,.5,1)}
        .bsp-btn.prev:hover svg{transform:translateX(-2px)}
        .bsp-btn.next:hover svg{transform:translateX(2px)}
        .bsp-btn.prev:active svg{transform:translateX(-5px)}
        .bsp-btn.next:active svg{transform:translateX(5px)}
        .bsp-rips{position:absolute;inset:0;border-radius:50%;overflow:hidden;pointer-events:none}
        .bsp-rip{position:absolute;width:10px;height:10px;margin:-5px 0 0 -5px;border-radius:50%;background:currentColor;opacity:.4;animation:bsp-rip .55s ease-out forwards}
        .bsp-btn.opt{width:28px;height:28px;background:transparent;box-shadow:none;opacity:.6}
        .bsp-btn.opt:hover{opacity:1;background:rgba(255,255,255,.12);box-shadow:none}
        .bsp-btn.opt svg{width:17px;height:17px}
        .bsp-btn.opt.on{color:var(--ac);opacity:1;background:color-mix(in srgb,var(--ac) 20%,transparent);
            box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--ac) 45%,transparent),0 0 12px color-mix(in srgb,var(--ac) 40%,transparent)}
        .bsp-btn.opt.on svg{filter:drop-shadow(0 0 3px color-mix(in srgb,var(--ac) 80%,transparent))}
        .bsp-btn.main{width:38px;height:38px;color:#04120a;
            background:linear-gradient(145deg,color-mix(in srgb,var(--ac) 55%,#fff),var(--ac) 55%,color-mix(in srgb,var(--ac) 75%,#000));
            box-shadow:0 4px 14px color-mix(in srgb,var(--ac) 55%,transparent),inset 0 1px 0 rgba(255,255,255,.45),inset 0 -2px 4px rgba(0,0,0,.18)}
        .bsp-btn.main:hover{background:linear-gradient(145deg,color-mix(in srgb,var(--ac) 45%,#fff),var(--ac) 55%,color-mix(in srgb,var(--ac) 80%,#000));
            box-shadow:0 6px 20px color-mix(in srgb,var(--ac) 70%,transparent),inset 0 1px 0 rgba(255,255,255,.5),inset 0 -2px 4px rgba(0,0,0,.18);transform:translateY(-1px) scale(1.1)}
        .bsp-btn.main:active{transform:scale(.9)}
        .bsp-btn.main svg{width:22px;height:22px}
        .bsp-btn.main::before{content:"";position:absolute;inset:0;border-radius:50%;pointer-events:none}
        .bsp-card.playing .bsp-btn.main::before{animation:bsp-ring 2.2s ease-out infinite}
        .bsp-prog{position:relative;display:flex;align-items:center;gap:8px;margin-top:8px;font-size:11px;color:var(--text-muted,#949ba4);font-variant-numeric:tabular-nums}
        .bsp-time{min-width:28px;flex:none}
        .bsp-time.r{text-align:right}
        /* ---- waveform seek bar ---- */
        .bsp-bar{position:relative;flex:1;height:26px;cursor:pointer;touch-action:none;--p:0%;--hp:0%}
        .bsp-wave{position:absolute;inset:0;display:flex;align-items:center;gap:2px}
        .bsp-wave i{flex:1;min-width:1px;height:calc(var(--h) * 100%);border-radius:2px;transform-origin:center;transition:transform .25s}
        .bsp-wl{position:absolute;inset:0}
        .bsp-wl.dim i{background:rgba(127,127,127,.38)}
        .bsp-wl.lit{clip-path:inset(0 calc(100% - var(--p)) 0 0);filter:drop-shadow(0 0 5px color-mix(in srgb,var(--ac) 70%,transparent))}
        .bsp-wl.lit i{background:linear-gradient(to top,color-mix(in srgb,var(--ac) 70%,#000),var(--ac) 55%,color-mix(in srgb,var(--ac) 60%,#fff))}
        .bsp-wl.ghost{clip-path:inset(0 calc(100% - var(--hp)) 0 0);opacity:0;transition:opacity .15s}
        .bsp-wl.ghost i{background:rgba(255,255,255,.28)}
        .bsp-bar:hover .bsp-wl.ghost,.bsp-bar.drag .bsp-wl.ghost{opacity:1}
        .bsp-card.playing .bsp-wave i{animation:bsp-bounce var(--bd,1s) ease-in-out infinite alternate;animation-delay:var(--dl,0s)}
        .bsp-bar:hover .bsp-wave i,.bsp-bar.drag .bsp-wave i{animation-play-state:paused;transform:scaleY(1.12)}
        .bsp-head{position:absolute;top:1px;bottom:1px;left:var(--p);width:2px;margin-left:-1px;border-radius:1px;background:#fff;
            box-shadow:0 0 8px 1px var(--ac),0 0 2px #fff;opacity:0;transition:opacity .2s,transform .2s}
        .bsp-card.playing .bsp-head,.bsp-bar:hover .bsp-head,.bsp-bar.drag .bsp-head{opacity:.95}
        .bsp-bar:hover .bsp-head,.bsp-bar.drag .bsp-head{transform:scaleY(1.15)}
        .bsp-tip{position:absolute;bottom:100%;left:var(--hp);margin-bottom:4px;transform:translateX(-50%) translateY(3px);padding:2px 6px;border-radius:6px;
            font-size:10.5px;font-weight:700;line-height:14px;color:#fff;background:rgba(0,0,0,.78);pointer-events:none;opacity:0;transition:opacity .15s,transform .15s;white-space:nowrap}
        .bsp-bar:hover .bsp-tip,.bsp-bar.drag .bsp-tip{opacity:1;transform:translateX(-50%)}
        /* ---- volume bar (slim, glowing) ---- */
        .bsp-fill{height:100%;width:var(--p,0%);border-radius:inherit;background:linear-gradient(90deg,color-mix(in srgb,var(--ac) 65%,#000),var(--ac) 60%,color-mix(in srgb,var(--ac) 65%,#fff));
            box-shadow:0 0 8px color-mix(in srgb,var(--ac) 60%,transparent);transition:width .12s}
        .bsp-knob{position:absolute;top:50%;left:var(--p,0%);width:11px;height:11px;margin:-5.5px 0 0 -5.5px;border-radius:50%;background:#fff;opacity:0;transform:scale(.4);
            transition:opacity .15s,transform .2s cubic-bezier(.3,1.6,.5,1);box-shadow:0 0 0 3px color-mix(in srgb,var(--ac) 35%,transparent),0 1px 3px rgba(0,0,0,.4)}
        .bsp-card.idle .bsp-ctl,.bsp-card.idle .bsp-prog{opacity:.4;pointer-events:none}
        /* compact: controls sit next to the cover, no times */
        .bsp-card.compact{padding:8px 10px}
        .bsp-card.compact .bsp-ctl{margin:0;gap:2px}
        .bsp-card.compact .bsp-eq,.bsp-card.compact .bsp-time{display:none}
        .bsp-card.compact .bsp-prog{margin-top:7px}
        .bsp-card.compact .bsp-btn{width:26px;height:26px}
        .bsp-card.compact .bsp-btn svg{width:18px;height:18px}
        .bsp-card.compact .bsp-btn.main{width:30px;height:30px}
        .bsp-card.compact .bsp-btn.opt{display:none}   /* no room for shuffle / repeat in the compact layout */
        .bsp-vol{position:relative;display:flex;align-items:center;gap:6px;margin-top:6px;font-size:11px;color:var(--text-muted,#949ba4);font-variant-numeric:tabular-nums}
        .bsp-vbtn{position:relative;width:24px;height:24px;border-radius:50%;flex:none;display:flex;align-items:center;justify-content:center;color:var(--text-muted,#949ba4);
            transition:background .2s,color .2s,transform .2s cubic-bezier(.3,1.5,.5,1)}
        .bsp-vbtn:hover{background:rgba(255,255,255,.14);color:var(--header-primary,#f2f3f5);transform:scale(1.12)}
        .bsp-vbtn:active{transform:scale(.88)}
        .bsp-vbtn svg{width:16px;height:16px;fill:currentColor;animation:bsp-pop .3s cubic-bezier(.3,1.7,.5,1)}
        .bsp-vbar{position:relative;flex:1;height:20px;cursor:pointer;touch-action:none;--p:0%;--hp:0%}
        .bsp-vbar::before{content:"";position:absolute;inset:-4px 0}
        .bsp-vw{display:flex;align-items:flex-end;gap:2px}
        .bsp-vw i{flex:1;min-width:1px;height:calc(var(--h) * 100%);border-radius:2px;transform-origin:bottom}
        .bsp-wl.bsp-vw.lit i{background:color-mix(in srgb,#ff4d6d calc(var(--t) * .55%),var(--ac))}
        .bsp-wl.bsp-vw.lit{filter:drop-shadow(0 0 4px color-mix(in srgb,var(--ac) 65%,transparent))}
        .bsp-vbar:hover .bsp-wl.ghost,.bsp-vbar.drag .bsp-wl.ghost{opacity:1}
        .bsp-card.playing .bsp-vw.lit i{animation:bsp-vb var(--bd,.8s) ease-in-out infinite alternate;animation-delay:var(--dl,0s)}
        .bsp-vbar:hover .bsp-vw.lit i,.bsp-vbar.drag .bsp-vw.lit i{animation-play-state:paused}
        .bsp-vbar.drag .bsp-vw i{transition:none}
        .bsp-vbar:hover .bsp-tip,.bsp-vbar.drag .bsp-tip{opacity:1;transform:translateX(-50%)}
        .bsp-vnum{min-width:24px;flex:none;text-align:right}
        .bsp-vol.novol{opacity:.4;pointer-events:none}
        .bsp-card.idle .bsp-vol{opacity:.4;pointer-events:none}
        @keyframes bsp-in{from{opacity:0;transform:translateY(8px) scale(.97)}to{opacity:1;transform:none}}
        @keyframes bsp-pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.045)}}
        @keyframes bsp-bounce{from{transform:scaleY(.62)}to{transform:scaleY(1)}}
        @keyframes bsp-vb{from{transform:scaleY(.8)}to{transform:scaleY(1)}}
        @keyframes bsp-pop{from{transform:scale(.4) rotate(-25deg);opacity:0}to{transform:none;opacity:1}}
        @keyframes bsp-rip{to{transform:scale(7);opacity:0}}
        @keyframes bsp-ring{0%{box-shadow:0 0 0 0 color-mix(in srgb,var(--ac) 55%,transparent)}100%{box-shadow:0 0 0 9px transparent}}
        @keyframes bsp-eq{from{height:20%}to{height:100%}}
        @keyframes bsp-marq{0%,18%{transform:translateX(0)}82%,100%{transform:translateX(var(--shift,0px))}}
        @media (prefers-reduced-motion:reduce){.bsp-card,.bsp-card *{animation:none!important;transition:none!important}}
        `);

        // ---------- card ----------
        const els = {};
        const withRipple = b => {
            const rips = h("span", { class: "bsp-rips" });
            b.append(rips);
            b.addEventListener("pointerdown", e => {
                const r = b.getBoundingClientRect();
                const d = h("span", { class: "bsp-rip" });
                d.style.left = (e.clientX - r.left) + "px";
                d.style.top = (e.clientY - r.top) + "px";
                rips.append(d);
                setTimeout(() => d.remove(), 600);
            });
            return b;
        };
        const setIco = (b, d) => {   // swap only the icon, the ripple layer stays
            const n = ico(d), old = b.querySelector("svg");
            if (old) old.replaceWith(n); else b.prepend(n);
        };
        const ctlBtn = (d, label, cls, onclick) => {
            const b = h("button", { type: "button", class: "bsp-btn" + (cls ? " " + cls : ""), title: label, "aria-label": label }, ico(d));
            b.addEventListener("click", e => { e.preventDefault(); e.stopPropagation(); onclick(); });
            return withRipple(b);
        };

        let isCollapsed = !!api.settings.get("collapsed", false);
        const rollIco = ico("M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z");
        rollIco.classList.add("bsp-roll-svg");
        els.rollBtn = h("button", {
            type: "button",
            class: "bsp-roll-btn",
            title: isCollapsed ? "Rozwiń odtwarzacz Spotify" : "Zwiń odtwarzacz Spotify",
            "aria-label": isCollapsed ? "Rozwiń odtwarzacz Spotify" : "Zwiń odtwarzacz Spotify"
        }, rollIco);
        els.rollBtn.addEventListener("click", e => {
            e.preventDefault();
            e.stopPropagation();
            isCollapsed = !isCollapsed;
            api.settings.set("collapsed", isCollapsed);
            render();
            applyCollapsed(true);
        });

        els.bg = h("div", { class: "bsp-bg" });
        els.art = h("div", { class: "bsp-art" }, ico(PATH.note));
        els.title = h("span", { class: "bsp-title" });
        els.marq = h("div", { class: "bsp-marq" }, els.title);
        els.artist = h("div", { class: "bsp-artist" });
        els.eq = h("div", { class: "bsp-eq" }, h("i"), h("i"), h("i"), h("i"));
        els.row = h("div", { class: "bsp-row" }, els.art, h("div", { class: "bsp-text" }, els.marq, els.artist), els.eq);

        els.shuf = ctlBtn(PATH.shuffle, "Shuffle", "opt", () => {
            const next = !st.shuffle;
            st.shuffle = next;
            holdModeUntil = performance.now() + 1200;
            send("shuffle:" + (next ? "on" : "off"));
            render();
        });
        els.rep = ctlBtn(PATH.repeat, "Repeat", "opt", () => {
            const modes = api.settings.get("repeatAll", false) ? ["none", "track", "list"] : ["none", "track"];
            const next = modes[(modes.indexOf(st.repeat) + 1) % modes.length];   // "list" with repeatAll off -> back to none
            st.repeat = next;
            holdModeUntil = performance.now() + 1200;
            send("repeat:" + next);
            render();
        });
        els.prev = ctlBtn(PATH.prev, "Previous", "prev", () => send("prev"));
        els.play = ctlBtn(PATH.play, "Play / Pause", "main", () => {
            st.pos = currentPos(); st.at = performance.now();
            st.playing = !st.playing;
            holdUntil = performance.now() + 900;
            send("toggle");
            render();
        });
        els.next = ctlBtn(PATH.next, "Next", "next", () => send("next"));
        els.ctl = h("div", { class: "bsp-ctl" }, els.shuf, els.prev, els.play, els.next, els.rep);

        els.cur = h("span", { class: "bsp-time" }, "0:00");
        els.end = h("span", { class: "bsp-time r" }, "0:00");
        const WAVE_N = 36;
        const mkLayer = cls => {
            const l = h("div", { class: "bsp-wl bsp-wave " + cls });
            for (let i = 0; i < WAVE_N; i++) l.append(h("i"));
            return l;
        };
        els.dim = mkLayer("dim"); els.ghost = mkLayer("ghost"); els.lit = mkLayer("lit");
        els.head = h("div", { class: "bsp-head" });
        els.tip = h("div", { class: "bsp-tip" }, "0:00");
        els.bar = h("div", { class: "bsp-bar", role: "slider", "aria-label": "Seek" }, els.dim, els.ghost, els.lit, els.head, els.tip);

        // every song gets its own (deterministic) waveform, seeded from its title/key
        let waveSeed = null;
        function buildWave(seed) {
            if (waveSeed === seed) return;
            waveSeed = seed;
            let x = 2166136261;
            for (let i = 0; i < seed.length; i++) { x ^= seed.charCodeAt(i); x = Math.imul(x, 16777619); }
            const rnd = () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return ((x >>> 0) % 10000) / 10000; };
            let prev = .5;
            for (let i = 0; i < WAVE_N; i++) {
                const swell = .55 + .45 * Math.sin((i / (WAVE_N - 1)) * Math.PI * (1.2 + rnd()));
                prev = prev * .45 + (.22 + rnd() * .78) * .55;
                const hgt = Math.max(.16, Math.min(1, prev * 0.6 + swell * 0.5));
                const dl = (-rnd() * 1.4).toFixed(2) + "s", bd = (.55 + rnd() * .7).toFixed(2) + "s";
                for (const l of [els.dim, els.ghost, els.lit]) {
                    const el = l.children[i];
                    el.style.setProperty("--h", hgt.toFixed(3));
                    el.style.setProperty("--dl", dl);
                    el.style.setProperty("--bd", bd);
                }
            }
        }
        buildWave("");

        let seekDrag = false;
        const fracFrom = e => {
            const r = els.bar.getBoundingClientRect();
            return Math.min(1, Math.max(0, (e.clientX - r.left) / (r.width || 1)));
        };
        const hover = e => {
            const f = fracFrom(e);
            els.bar.style.setProperty("--hp", (f * 100).toFixed(2) + "%");
            setText(els.tip, fmt(f * st.dur));
            if (seekDrag) { els.bar.style.setProperty("--p", (f * 100).toFixed(2) + "%"); setText(els.cur, fmt(f * st.dur)); }
        };
        els.bar.addEventListener("pointermove", hover);
        els.bar.addEventListener("pointerdown", e => {
            if (e.button !== 0 || !(st.dur > 0)) return;
            e.preventDefault();
            seekDrag = true;
            try { els.bar.setPointerCapture(e.pointerId); } catch { }
            els.bar.classList.add("drag");
            hover(e);
        });
        const endSeek = e => {
            if (!seekDrag) return;
            seekDrag = false;
            els.bar.classList.remove("drag");
            if (e.type === "pointercancel") return;
            const ms = Math.round(fracFrom(e) * st.dur);
            st.pos = ms; st.at = performance.now();
            send("seek:" + ms);
            tick();
        };
        els.bar.addEventListener("pointerup", endSeek);
        els.bar.addEventListener("pointercancel", endSeek);
        els.prog = h("div", { class: "bsp-prog" }, els.cur, els.bar, els.end);

        // ---- volume (Spotify's own slider in the Windows volume mixer) ----
        els.vbtn = h("button", { type: "button", class: "bsp-vbtn", title: "Mute Spotify", "aria-label": "Mute Spotify" }, ico(PATH.volUp));
        withRipple(els.vbtn);
        const VOL_N = 24;
        const mkVLayer = cls => {
            const l = h("div", { class: "bsp-wl bsp-vw " + cls });
            for (let i = 0; i < VOL_N; i++) {
                const e = h("i");
                const k = i / (VOL_N - 1);
                e.style.setProperty("--h", (.28 + .72 * k).toFixed(3));
                e.style.setProperty("--t", (k * 100).toFixed(1));
                e.style.setProperty("--dl", (-((i * 37) % 11) / 10).toFixed(1) + "s");
                e.style.setProperty("--bd", (.5 + ((i * 53) % 7) / 10).toFixed(1) + "s");
                l.append(e);
            }
            return l;
        };
        els.vtip = h("div", { class: "bsp-tip" }, "0");
        els.vbar = h("div", { class: "bsp-vbar", role: "slider", "aria-label": "Volume" },
            mkVLayer("dim"), mkVLayer("ghost"), mkVLayer("lit"), els.vtip);
        els.vnum = h("span", { class: "bsp-vnum" }, "--");
        els.vol = h("div", { class: "bsp-vol novol", title: "Spotify volume (appears once Spotify has played something)" }, els.vbtn, els.vbar, els.vnum);

        let volDrag = false, lastVolSend = 0;
        const setVol = (v, final) => {
            v = Math.max(0, Math.min(100, Math.round(v)));
            st.volume = v;
            if (v > 0) st.muted = false;
            holdVolUntil = performance.now() + 1500;
            const now = performance.now();
            if (final || now - lastVolSend > 90) { lastVolSend = now; send("volume:" + v); }   // the last value is always sent on release
            render();
        };
        const volFrom = e => {
            const r = els.vbar.getBoundingClientRect();
            return Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * 100;
        };
        els.vbar.addEventListener("pointerdown", e => {
            if (typeof st.volume !== "number") return;
            e.preventDefault();
            volDrag = true;
            try { els.vbar.setPointerCapture(e.pointerId); } catch { }
            els.vbar.classList.add("drag");
            setVol(volFrom(e));
        });
        els.vbar.addEventListener("pointermove", e => {
            const v = volFrom(e);
            els.vbar.style.setProperty("--hp", v.toFixed(1) + "%");
            setText(els.vtip, String(Math.round(v)));
            if (volDrag) setVol(v);
        });
        const endVolDrag = () => {
            if (!volDrag) return;
            volDrag = false;
            els.vbar.classList.remove("drag");
            if (typeof st.volume === "number") setVol(st.volume, true);
        };
        els.vbar.addEventListener("pointerup", endVolDrag);
        els.vbar.addEventListener("pointercancel", endVolDrag);
        els.vol.addEventListener("wheel", e => {   // mouse wheel over the volume row: +/- 5
            if (typeof st.volume !== "number") return;
            e.preventDefault();
            setVol(st.volume + (e.deltaY < 0 ? 5 : -5), true);
        }, { passive: false });
        els.vbtn.addEventListener("click", e => {   // speaker icon: mute / unmute Spotify only
            e.preventDefault(); e.stopPropagation();
            if (typeof st.volume !== "number") return;
            st.muted = !st.muted;
            holdVolUntil = performance.now() + 1500;
            send("mute:" + (st.muted ? "on" : "off"));
            render();
        });

        els.bodyInner = h("div", { class: "bsp-body-inner" }, els.ctl, els.prog, els.vol);
        els.body = h("div", { class: "bsp-body" }, els.bodyInner);
        const card = h("div", { class: "bsp-card noart idle", "data-bsp": "1" }, els.rollBtn, els.bg, els.row, els.body);
        card.style.display = "none";
        card.addEventListener("click", e => {
            if (isCollapsed && !e.target.closest("button")) {
                isCollapsed = false;
                api.settings.set("collapsed", false);
                render();
                applyCollapsed(true);
            } else {
                e.stopPropagation();
            }
        });

        // Glide the body open/closed with the Web Animations API. We use WAAPI (not a CSS transition)
        // on purpose: it keeps running even when the OS "reduce motion" setting is on, which disables
        // the CSS transitions elsewhere in this card. Heights are explicit px so it never snaps, and
        // pinning height:auto afterwards lets the content resize freely (song change, volume bar, etc).
        let bodyAnim = null;
        function applyCollapsed(animate) {
            if (!els.body) return;
            if (bodyAnim) { try { bodyAnim.cancel(); } catch { } bodyAnim = null; }
            const settle = () => {
                els.body.style.height = isCollapsed ? "0px" : "auto";
                els.body.style.opacity = isCollapsed ? "0" : "1";
            };
            if (!animate) { settle(); return; }
            const full = Math.max(1, els.bodyInner.offsetHeight);   // natural content height
            const from = isCollapsed ? full : 0;
            const to = isCollapsed ? 0 : full;
            els.body.style.height = from + "px";
            els.body.style.opacity = isCollapsed ? "1" : "0";
            bodyAnim = els.body.animate(
                [{ height: from + "px", opacity: isCollapsed ? 1 : 0 },
                 { height: to + "px", opacity: isCollapsed ? 0 : 1 }],
                { duration: 360, easing: "cubic-bezier(.22,.61,.36,1)", fill: "forwards" }
            );
            bodyAnim.onfinish = bodyAnim.oncancel = () => {
                const a = bodyAnim;
                if (!a) return;
                bodyAnim = null;                 // null first so cancel()'s re-entrant event bails here
                try { a.cancel(); } catch { }    // drop the fill so inline styles take over cleanly
                settle();
            };
        }

        // ---------- rendering ----------
        const setText = (el, v) => { if (el.textContent !== v) el.textContent = v; };
        let lastLayoutCompact = null;

        function currentPos() {
            let p = st.pos;
            if (st.running && st.playing) p += performance.now() - st.at;
            return st.dur > 0 ? Math.min(Math.max(p, 0), st.dur) : Math.max(p, 0);
        }

        function tick() {
            if (seekDrag) return;
            const p = currentPos();
            const frac = st.dur > 0 ? p / st.dur : 0;
            els.bar.style.setProperty("--p", (frac * 100).toFixed(2) + "%");
            setText(els.cur, fmt(p));
            setText(els.end, st.dur > 0 ? fmt(st.dur) : "-:--");
        }

        function fitTitle() {
            requestAnimationFrame(() => {
                if (!card.isConnected || card.style.display === "none") return;
                const over = els.title.scrollWidth - els.marq.clientWidth;
                els.marq.classList.toggle("scroll", over > 4);
                if (over > 4) {
                    els.marq.style.setProperty("--shift", -(over + 2) + "px");
                    els.marq.style.setProperty("--dur", Math.max(5, over / 22 + 3).toFixed(1) + "s");
                }
            });
        }

        function render() {
            const hideIdle = api.settings.get("hideIdle", true);
            const compact = !!api.settings.get("compact", false);
            const showProg = api.settings.get("progress", true);

            card.style.display = (!st.running && hideIdle) ? "none" : "";
            card.classList.toggle("playing", st.running && st.playing);
            card.classList.toggle("idle", !st.running);
            card.classList.toggle("compact", compact);
            card.classList.toggle("bsp-collapsed", isCollapsed);
            els.rollBtn.title = isCollapsed ? "Rozwiń odtwarzacz Spotify" : "Zwiń odtwarzacz Spotify";
            els.rollBtn.setAttribute("aria-label", isCollapsed ? "Rozwiń odtwarzacz Spotify" : "Zwiń odtwarzacz Spotify");
            els.prog.style.display = showProg ? "" : "none";

            if (lastLayoutCompact !== compact) {   // compact puts the buttons on the cover row
                lastLayoutCompact = compact;
                if (compact) els.row.insertBefore(els.ctl, els.eq); else els.bodyInner.prepend(els.ctl);
            }

            const title = st.running ? (st.title || "Nothing playing") : "Spotify isn't running";
            const artist = st.running ? st.artist : "Open Spotify to use the controls";
            const changed = els.title.textContent !== title;
            setText(els.title, title);
            setText(els.artist, artist);
            if (changed) fitTitle();

            const wantPause = st.running && st.playing;
            const icon = wantPause ? "pause" : "play";
            if (els.play.getAttribute("data-icon") !== icon) {
                els.play.setAttribute("data-icon", icon);
                setIco(els.play, PATH[icon]);
            }

            const hasArt = st.running && art.src && art.key === st.key;
            card.classList.toggle("noart", !hasArt);
            const url = hasArt ? 'url("' + art.src + '")' : "none";
            if (els.art.getAttribute("data-src") !== (hasArt ? art.src.length + ":" + art.key : "")) {
                els.art.setAttribute("data-src", hasArt ? art.src.length + ":" + art.key : "");
                els.art.style.backgroundImage = url;
                els.bg.style.backgroundImage = url;
            }

            const shufOn = st.running && !!st.shuffle;
            els.shuf.classList.toggle("on", shufOn);
            els.shuf.title = els.shuf.ariaLabel = "Shuffle: " + (shufOn ? "on" : "off");
            const rep = st.running ? (st.repeat || "none") : "none";
            els.rep.classList.toggle("on", rep !== "none");
            els.rep.title = els.rep.ariaLabel = "Repeat: " + (rep === "track" ? "this song" : rep === "list" ? "playlist" : "off");
            const repIcon = rep === "track" ? "repeatOne" : "repeat";
            if (els.rep.getAttribute("data-icon") !== repIcon) {
                els.rep.setAttribute("data-icon", repIcon);
                setIco(els.rep, PATH[repIcon]);
            }

            els.vol.style.display = api.settings.get("volume", true) ? "" : "none";
            const hasVol = st.running && typeof st.volume === "number";
            els.vol.classList.toggle("novol", !hasVol);
            const shown = hasVol ? (st.muted ? 0 : st.volume) : 0;
            els.vbar.style.setProperty("--p", shown + "%");
            setText(els.vnum, hasVol ? String(shown) : "--");
            els.vbtn.title = els.vbtn.ariaLabel = st.muted ? "Unmute Spotify" : "Mute Spotify";
            const volIcon = shown === 0 ? "volOff" : shown < 50 ? "volDown" : "volUp";
            if (els.vbtn.getAttribute("data-icon") !== volIcon) {
                els.vbtn.setAttribute("data-icon", volIcon);
                setIco(els.vbtn, PATH[volIcon]);
            }
            buildWave(st.running ? (st.key || st.title || "") + "|" + st.artist : "");
            tick();
        }
        refreshSpotify = render;

        // ---------- data from loader.js ----------
        const onMedia = e => {
            const d = e.detail || {};
            if (d.art !== undefined && d.art !== null) art = { key: d.artKey, src: String(d.art) };
            if (d.running === false) {
                st = { running: false, playing: false, title: "", artist: "", pos: 0, dur: 0, key: "", shuffle: false, repeat: "none", volume: null, muted: false, at: performance.now() };
            } else {
                const keepMode = performance.now() < holdModeUntil;
                const keepVol = volDrag || performance.now() < holdVolUntil;
                const playing = performance.now() < holdUntil ? st.playing : !!d.playing;
                st = {
                    running: true, playing,
                    title: String(d.title || ""), artist: String(d.artist || ""),
                    pos: Number(d.pos) || 0, dur: Number(d.dur) || 0,
                    key: String(d.key || ""), at: performance.now(),
                    shuffle: keepMode ? st.shuffle : d.shuffle === true,
                    repeat: keepMode ? st.repeat : (d.repeat === "track" || d.repeat === "list" ? d.repeat : "none"),
                    volume: keepVol ? st.volume : (typeof d.volume === "number" ? d.volume : null),
                    muted: keepVol ? st.muted : d.muted === true
                };
            }
            render();
        };
        api.on(window, "beecord-media", onMedia);
        api.on(window, "blxstncord-media", onMedia);

        // ---------- placing it above the user bar ----------
        const MUTE_RE = /(?:^|\b)(mute|unmute|wycisz|wyciszenie)(?:\b|$)/i;
        // never match anything inside our own card (its mute button used to be picked as "the user bar",
        // which made the card try to insert itself into itself: "The new child element contains the parent")
        const usable = el => !card.contains(el) && !el.closest("#blxstncord-panel") && !el.closest("#beecord-panel") && !el.closest('[role="dialog"],[aria-modal="true"]');
        function findBar() {
            const sec = [...document.querySelectorAll('section[class*="panels"], section[aria-label="User status and settings"], [aria-label*="User area"]')].find(usable);
            if (sec) return sec;
            const mute = [...document.querySelectorAll("[aria-label]")].filter(usable)
                .find(e => MUTE_RE.test((e.getAttribute("aria-label") || "").trim()))
                || [...document.querySelectorAll('[role="switch"]')].filter(usable)[0];
            const bar = mute ? (mute.closest("section") || mute.closest('[class*="container_"]') || mute.parentElement) : null;
            return bar && usable(bar) ? bar : null;
        }
        let placedAs = "";
        function mount() {
            const bar = findBar();
            if (bar) {
                card.classList.remove("bsp-float");
                if (card.parentElement !== bar || bar.firstElementChild !== card) bar.prepend(card);
                if (placedAs !== "bar") { placedAs = "bar"; api.log("card placed above the user bar"); }
            } else if (card.parentElement !== document.body) {
                // e.g. while Discord's settings are open (no user bar on screen)
                card.classList.add("bsp-float");
                document.body.append(card);
                if (placedAs !== "float") { placedAs = "float"; api.log("user bar not on screen, using a floating card"); }
            }
            if (card.style.display !== "none") fitTitle();
        }
        // shared core watcher (one observer for all plugins), at most every 400 ms
        api.dom.observe(() => { try { mount(); } catch (e) { api.log("placement error: " + (e && e.message || e)); } }, { throttle: 400 });

        // animate the progress bar only while something plays and the card is visible; otherwise check twice a second
        let raf = 0, idle = 0;
        const loop = () => {
            raf = 0; idle = 0;
            if (card.style.display !== "none" && st.playing && !document.hidden && !isCollapsed) { tick(); raf = requestAnimationFrame(loop); }
            else { if (card.style.display !== "none") tick(); idle = setTimeout(loop, 500); }
        };
        loop();

        render();
        mount();
        applyCollapsed(false);   // set the saved open/closed state without animating on load
        send("start");

        api.cleanup(() => {
            send("stop");
            cancelAnimationFrame(raf);
            clearTimeout(idle);
            card.remove();
            refreshSpotify = null;
        });
    },

    options(api) {
        const set = (k, v) => { api.settings.set(k, v); if (refreshSpotify) refreshSpotify(); };
        return [
            api.ui.row("Zwiń odtwarzacz (zostaw tylko mini pasek)",
                api.ui.toggle(api.settings.get("collapsed", false), v => set("collapsed", v))),
            api.ui.row("Hide the card when Spotify isn't running",
                api.ui.toggle(api.settings.get("hideIdle", true), v => set("hideIdle", v))),
            api.ui.row("Show progress bar",
                api.ui.toggle(api.settings.get("progress", true), v => set("progress", v))),
            api.ui.row("Compact layout (buttons next to the cover)",
                api.ui.toggle(api.settings.get("compact", false), v => set("compact", v))),
            api.ui.row("Repeat button also has \"repeat playlist\" (off \u2192 song \u2192 playlist)",
                api.ui.toggle(api.settings.get("repeatAll", false), v => set("repeatAll", v))),
            api.ui.row("Show volume bar",
                api.ui.toggle(api.settings.get("volume", true), v => set("volume", v))),
            api.ui.note("Works with the Spotify desktop app on Windows. Click the progress bar to seek. The volume bar controls Spotify's volume in the Windows mixer (separate from the slider inside Spotify; mouse wheel changes it too, the speaker icon mutes). Shuffle and repeat buttons are hidden in the compact layout.")
        ];
    }
});
