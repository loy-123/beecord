// Link Safety: marks dangerous links in chat and asks before opening them.
//  - IP loggers / grabbers (grabify, iplogger, and their disguise domains) -> red, blocked behind a warning
//  - fake Discord / Steam / Nitro domains (dlscord, steamcommunlty, discord-gift...) -> red
//  - punycode / look-alike letters (xn--), raw IP addresses -> orange
//  - link shorteners (bit.ly, tinyurl...) hide where they go -> orange
//  - masked links whose text shows a different site than the real target -> orange
// Nothing is fetched: opening a link to "check" it would already give your IP to the logger.
(window.beecord || window.blxstncord).definePlugin({
    id: "link-safety",
    name: "Link Safety",
    description: "Marks IP-grabber, phishing, look-alike, shortened and masked links in chat and asks before you open them.",
    author: "beecord",
    version: "1.0.0",
    enabledByDefault: true,
    webpack: false,

    start(api) {
        const GRABBERS = ["grabify.link", "grabify.world", "grabify.org", "iplogger.org", "iplogger.com", "iplogger.ru", "iplogger.co", "iplogger.info",
            "iplogger.cn", "2no.co", "yip.su", "iplis.ru", "ipgrabber.ru", "ipgraber.ru", "blasze.com", "blasze.tk", "ezstat.ru", "lovebird.guru",
            "trulove.guru", "dateing.club", "otherhalf.life", "shrekis.life", "datasig.io", "datauth.io", "headshot.monster", "gaming-at-my.best",
            "progaming.monster", "yourmy.monster", "screenshare.host", "imageshare.best", "screenshot.best", "gamingfun.me", "catsnthing.com",
            "mypic.icu", "catsnthings.fun", "curiouscat.club", "joinmy.site", "fortnitechat.site", "fortnight.space", "freegiftcards.co",
            "stopify.co", "leancoding.co", "bmwforum.co", "quickmessage.us", "spottyfly.com", "canarytokens.com", "canarytokens.org",
            "iplogger.su", "ipgrab.link", "ip-grabber.com", "whatstheirip.com", "ps3cfw.com", "partpicker.shop", "sportshub.bar", "locations.quest",
            "lovebird.co", "xn--yutube-iqc.com", "xn--yotube-qqc.com"];
        const SHORTENERS = ["bit.ly", "tinyurl.com", "t.co", "is.gd", "v.gd", "cutt.ly", "rb.gy", "shorturl.at", "goo.gl", "ow.ly", "buff.ly",
            "rebrand.ly", "tiny.cc", "s.id", "t.ly", "bl.ink", "lnkd.in", "shorte.st", "adf.ly", "ouo.io", "bc.vc", "linktr.ee", "tr.im", "x.gd", "u.to", "clck.ru"];
        const OFFICIAL = /(^|\.)(discord\.com|discord\.gg|discord\.media|discordapp\.com|discordapp\.net|discord\.new|discord\.gift|discord\.co|discordstatus\.com|discord\.dev|steampowered\.com|steamcommunity\.com|steamstatic\.com|steam\.com|steamdeck\.com)$/i;
        // misspelled Discord / Steam names (not the real word) and "free nitro" style names are phishing
        const DISCORD_LIKE = /d[i1l!|]+[s5$]+[ck]+[o0]+r+[dcl]+|dlsc|disc[o0]rcl|discrod|disocrd|dicsord|dizcord/i;
        const STEAM_LIKE = /st[e3]+[a4]+m+c[o0]+m+[un]+[il1]+[t7]+y|st[e3]+[a4]+mp[o0]+w[e3]+r|steamcommunlty|stearn|steancommunity|stemcommunity/i;
        const NITRO_SCAM = /(nitro|discord).*(gift|free|claim|drop|airdrop|promo)|(gift|free|claim|drop|airdrop|promo).*(nitro|discord)/i;
        const onList = (host, list) => list.some(d => host === d || host.endsWith("." + d));

        const check = a => {
            let u;
            try { u = new URL(a.href); } catch { return null; }
            if (!/^https?:$/.test(u.protocol)) return null;
            const host = u.hostname.toLowerCase().replace(/\.$/, "");
            const custom = String(api.settings.get("block", "")).split(/[\s,]+/).filter(Boolean).map(s => s.toLowerCase());
            if (onList(host, GRABBERS) || onList(host, custom)) return { level: "danger", why: "Known IP logger / grabber. Opening it gives the sender your IP address and approximate location." };
            if (!OFFICIAL.test(host)) {
                const flat = host.replace(/[-.]/g, "");
                const fake = (DISCORD_LIKE.test(flat) && !flat.includes("discord"))
                    || (STEAM_LIKE.test(flat) && !flat.includes("steamcommunity") && !flat.includes("steampowered"))
                    || NITRO_SCAM.test(flat);
                if (fake) return { level: "danger", why: "Looks like a fake Discord / Steam / Nitro site (phishing). Real ones are only discord.com, discord.gg, steamcommunity.com, steampowered.com." };
                if (/discord|steamcommunity|steampowered/.test(flat)) return { level: "warn", why: host + " is not an official Discord or Steam website. Never log in there." };
            }
            if (host.split(".").some(p => p.startsWith("xn--"))) return { level: "warn", why: "This address uses look-alike letters (punycode " + host + "). It may imitate a real site." };
            if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.startsWith("[")) return { level: "warn", why: "This link goes to a raw IP address instead of a website name." };
            if (onList(host, SHORTENERS)) return { level: "warn", why: "Shortened link: you can't see where it really goes, and the shortener can log your visit." };
            const text = (a.textContent || "").trim();
            const shown = /^(?:https?:\/\/)?([a-z0-9-]+(?:\.[a-z0-9-]+)+)(?:[/:?#]|$)/i.exec(text);
            if (shown) {
                const sh = shown[1].toLowerCase().replace(/^www\./, ""), real = host.replace(/^www\./, "");
                if (sh !== real && !real.endsWith("." + sh) && !sh.endsWith("." + real)) return { level: "warn", why: "The link text shows " + sh + " but it really opens " + host + "." };
            }
            return null;
        };

        api.addStyle(`
            a[data-bc-link="danger"]{color:#f23f43!important;text-decoration:line-through wavy #f23f43!important}
            a[data-bc-link="danger"]::before{content:"⚠ ";text-decoration:none;display:inline-block}
            a[data-bc-link="warn"]{text-decoration:underline wavy #f0b232!important}`);
        const mark = () => {
            if (!api.settings.get("mark", true)) return;
            for (const a of document.querySelectorAll('li[id^="chat-messages-"] a[href], [class*="embed"] a[href]')) {
                if (a.__bcChecked === a.href) continue;
                a.__bcChecked = a.href;
                const r = check(a);
                if (r) { a.setAttribute("data-bc-link", r.level); a.title = (r.level === "danger" ? "DANGEROUS: " : "Careful: ") + r.why; }
                else a.removeAttribute("data-bc-link");
            }
        };
        api.dom.observe(mark); // shared core watcher
        api.cleanup(() => { for (const a of document.querySelectorAll("a[data-bc-link]")) { a.removeAttribute("data-bc-link"); a.__bcChecked = null; } });

        const approved = new WeakSet();
        const onClick = async e => {
            const a = e.target && e.target.closest && e.target.closest("a[href]");
            if (!a || approved.has(a) || e.button > 1) return;
            if (!a.closest('li[id^="chat-messages-"], [class*="embed"], [class*="markup"]')) return;
            const r = check(a);
            if (!r || (r.level === "warn" && !api.settings.get("askWarn", true))) return;
            e.preventDefault(); e.stopImmediatePropagation();
            if (e.type !== "click") return; // middle-click (auxclick) is just blocked
            const ok = await api.ui.confirm(r.level === "danger" ? "Dangerous link" : "Check this link", r.why + "\n\n" + a.href,
                r.level === "danger" ? "Open anyway" : "Open", "Don't open");
            if (!ok) return;
            approved.add(a);
            try { a.click(); } finally { setTimeout(() => approved.delete(a), 1000); }
        };
        api.on(document, "click", onClick, true);
        api.on(document, "auxclick", onClick, true);
        this.__check = href => { const a = document.createElement("a"); a.href = href; a.textContent = href; return check(a); };
    },

    options(api) {
        const out = api.ui.note("");
        const test = api.ui.input("", v => {
            const r = this.__check && v.trim() ? this.__check(v.trim().startsWith("http") ? v.trim() : "https://" + v.trim()) : null;
            out.textContent = !v.trim() ? "" : r ? (r.level === "danger" ? "DANGEROUS: " : "Careful: ") + r.why : "Looks OK (not on any list).";
        }, "test a link");
        test.style.width = "240px";
        return [
            api.ui.row("Mark risky links in chat (red / orange)", api.ui.toggle(api.settings.get("mark", true), v => api.settings.set("mark", v))),
            api.ui.row("Also ask before opening orange (suspicious) links", api.ui.toggle(api.settings.get("askWarn", true), v => api.settings.set("askWarn", v))),
            api.ui.row("Test a link", test), out,
            api.ui.note("Extra domains to treat as dangerous (space or comma separated):"),
            api.ui.textarea(api.settings.get("block", ""), v => api.settings.set("block", v), "example-logger.com other-bad.site")
        ];
    }
});
