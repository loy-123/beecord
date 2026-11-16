// Send Timestamps: write a time in braces and everyone sees it in their own time zone.
//   {18:30}                 today 18:30            -> <t:…:t>
//   {tomorrow 9:00}         ({jutro 9:00} too)     -> <t:…:f>
//   {24.12 18:00} {24.12.2026 18:00} {2026-12-24 18:00}
//   {in 2h} {in 30m} {in 1d 3h}  ({za 2h} too)     -> <t:…:R>  ("in 2 hours")
//   add |R |F |f |t |T |d |D to pick the style:  {18:30|R}
(window.beecord || window.blxstncord).definePlugin({
    id: "send-timestamps",
    name: "Send Timestamps",
    description: "Type {18:30}, {tomorrow 9:00}, {24.12 18:00} or {in 2h} and it is sent as a Discord timestamp everyone sees in their own time zone.",
    author: "beecord",
    version: "1.0.0",
    enabledByDefault: true,
    webpack: false,

    start(api) {
        const STYLES = "tTdDfFR";
        const at = (d, h, m) => { const x = new Date(d); x.setHours(h, m, 0, 0); return x; };
        const parse = raw => {
            let s = raw.trim().toLowerCase(), style = null;
            const st = /\|\s*([tTdDfFR])$/.exec(raw.trim());
            if (st) { style = st[1]; s = s.replace(/\|\s*[a-z]$/i, "").trim(); }
            let m;
            if ((m = /^(?:in|za)\s+((?:\d+\s*(?:d|h|m|min|s)\s*)+)$/.exec(s))) {
                let ms = 0;
                for (const [, n, u] of m[1].matchAll(/(\d+)\s*(d|h|min|m|s)/g)) ms += Number(n) * ({ d: 864e5, h: 36e5, min: 6e4, m: 6e4, s: 1e3 })[u];
                return { date: new Date(Date.now() + ms), style: style || "R" };
            }
            const time = /(\d{1,2})[:.](\d{2})$/.exec(s);
            if (!time) return null;
            const hh = Number(time[1]), mm = Number(time[2]);
            if (hh > 23 || mm > 59) return null;
            const day = s.slice(0, time.index).trim();
            const now = new Date();
            if (!day || day === "today" || day === "dzis" || day === "dziś") return { date: at(now, hh, mm), style: style || "t" };
            if (day === "tomorrow" || day === "jutro") { const d = new Date(now); d.setDate(d.getDate() + 1); return { date: at(d, hh, mm), style: style || "f" }; }
            if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(day))) return { date: at(new Date(+m[1], +m[2] - 1, +m[3]), hh, mm), style: style || "f" };
            if ((m = /^(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?$/.exec(day))) {
                let y = m[3] ? Number(m[3]) : now.getFullYear();
                if (y < 100) y += 2000;
                let d = at(new Date(y, +m[2] - 1, +m[1]), hh, mm);
                if (!m[3] && d < now - 864e5) d = at(new Date(y + 1, +m[2] - 1, +m[1]), hh, mm); // date without year that already passed -> next year
                return { date: d, style: style || "f" };
            }
            return null;
        };
        api.messages.onSend(msg => {
            if (typeof msg.content !== "string" || !msg.content.includes("{")) return;
            let n = 0;
            msg.content = msg.content.split(/(```[\s\S]*?```|`[^`\n]*`)/).map((part, i) => i % 2 ? part
                : part.replace(/\{([^{}\n]{3,40})\}/g, (all, inner) => {
                    const r = parse(inner);
                    if (!r || isNaN(r.date) || !STYLES.includes(r.style)) return all;
                    n++;
                    return "<t:" + Math.floor(r.date.getTime() / 1000) + ":" + r.style + ">";
                })).join("");
            return n ? msg : undefined;
        }, 20);
    },

    options(api) {
        return [api.ui.note("Examples: {18:30}  {tomorrow 9:00}  {jutro 9:00}  {24.12 18:00}  {2026-12-24 18:00}  {in 2h 30m}  {za 15m}. " +
            "Add a style after |: t short time, T long time, d/D date, f/F date+time, R relative — e.g. {18:30|R}.")];
    }
});
