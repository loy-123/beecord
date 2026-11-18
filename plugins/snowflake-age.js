// Snowflake Age: Discord IDs (snowflakes) carry the exact moment they were created in the number
// itself — this plugin finds raw IDs in messages and shows that creation date on hover (and, optionally,
// a small age tag inline). It's pure local math on the ID (id >> 22 + Discord epoch); it reads nothing
// hidden, contacts nothing, and reveals only what Discord already derives from the same number.
(window.beecord || window.blxstncord).definePlugin({
    id: "snowflake-age",
    name: "Snowflake Age",
    description: "Show the creation date of Discord IDs (snowflakes) found in messages, on hover. Pure local math — no network, nothing hidden.",
    author: "beecord",
    version: "1.0.0",
    category: "Tools",
    enabledByDefault: false,
    webpack: false,

    start(api) {
        const EPOCH = 1420070400000n;           // Discord epoch: 2015-01-01T00:00:00Z
        const MIN = 1420070400000;              // no snowflake predates the epoch
        const SNOW = /\b\d{17,20}\b/;           // a raw ID is 17–20 digits

        const toDate = id => {
            try {
                const ms = Number((BigInt(id) >> 22n) + EPOCH);
                if (!isFinite(ms) || ms < MIN || ms > Date.now() + 86400000) return null;   // reject non-snowflake numbers
                return new Date(ms);
            } catch { return null; }
        };
        const ago = d => {
            const s = Math.max(0, (Date.now() - d.getTime()) / 1000);
            const u = [["y", 31557600], ["mo", 2629800], ["d", 86400], ["h", 3600], ["m", 60]];
            for (const [label, secs] of u) { const n = Math.floor(s / secs); if (n >= 1) return n + label + " ago"; }
            return "just now";
        };
        const fmt = d => {
            try { return d.toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }); }
            catch { return d.toISOString(); }
        };

        api.addStyle(
            ".bc-sfa{border-bottom:1px dotted var(--ig-accent,#9dbfea);cursor:help}" +
            ".bc-sfa-tag{margin-left:4px;padding:0 5px;border-radius:5px;font-size:11px;font-weight:600;" +
            "color:var(--ig-accent,#9dbfea);background:color-mix(in srgb,var(--ig-accent,#9dbfea) 15%,transparent);white-space:nowrap}");

        const CONTENT = '[id^="message-content-"]';

        const decorate = el => {
            const showTag = api.settings.get("inlineTag", true);
            // walk the text nodes of this message and wrap any standalone snowflake
            const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
                acceptNode: n => {
                    const p = n.parentNode;
                    const inSfa = p && p.classList && p.classList.contains("bc-sfa");
                    return (!inSfa && SNOW.test(n.nodeValue)) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
                }
            });
            const targets = [];
            let n; while ((n = walker.nextNode())) targets.push(n);

            for (const node of targets) {
                const text = node.nodeValue;
                const re = /\b\d{17,20}\b/g;
                let last = 0, m, any = false;
                const frag = document.createDocumentFragment();
                while ((m = re.exec(text))) {
                    const d = toDate(m[0]);
                    if (!d) continue;
                    any = true;
                    if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
                    const span = document.createElement("span");
                    span.className = "bc-sfa";
                    span.textContent = m[0];
                    span.title = "Created " + fmt(d) + "  ·  " + ago(d);
                    frag.appendChild(span);
                    if (showTag) {
                        const tag = document.createElement("span");
                        tag.className = "bc-sfa-tag";
                        tag.textContent = ago(d);
                        tag.title = "Created " + fmt(d);
                        frag.appendChild(tag);
                    }
                    last = m.index + m[0].length;
                }
                if (!any) continue;
                if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
                try { node.parentNode.replaceChild(frag, node); } catch { }
            }
        };

        const scan = () => {
            for (const el of document.querySelectorAll(CONTENT)) {
                if (el.querySelector(".bc-sfa")) continue;          // already decorated (re-renders drop the spans)
                if (!SNOW.test(el.textContent || "")) continue;     // no ID in this message
                decorate(el);
            }
        };
        api.dom.observe(scan, { throttle: 350 });

        api.cleanup(() => {
            for (const t of document.querySelectorAll(".bc-sfa-tag")) { try { t.remove(); } catch { } }
            for (const s of document.querySelectorAll(".bc-sfa")) {
                try { s.replaceWith(document.createTextNode(s.textContent)); } catch { }
            }
        });

        api.log("Snowflake Age started");
    },

    options(api) {
        return [
            api.ui.row("Show an inline age tag after each ID",
                api.ui.toggle(api.settings.get("inlineTag", true), v => api.settings.set("inlineTag", v))),
            api.ui.note("Finds raw 17–20 digit Discord IDs in messages and shows when that account/object was created (hover the underlined ID for the full date). It's just arithmetic on the ID — the same creation time Discord shows itself — with no network calls and nothing hidden revealed.")
        ];
    }
});
