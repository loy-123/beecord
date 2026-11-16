// No Track: blocks Discord's analytics/telemetry requests (/science, /metrics, error reporting to Sentry).
// Blocked requests are answered locally with "204 No Content", so Discord does not retry them.
(window.beecord || window.blxstncord).definePlugin({
    id: "no-track",
    name: "No Track",
    description: "Blocks Discord analytics and telemetry (/science, /metrics, Sentry error reports). Nothing you use stops working.",
    author: "beecord",
    version: "1.0.0",
    enabledByDefault: true,
    webpack: false,

    start(api) {
        const BLOCK = [
            /\/api\/v\d+\/science(?:[/?#]|$)/i,
            /\/api\/v\d+\/metrics(?:[/?#]|$)/i,
            /\/api\/v\d+\/track(?:[/?#]|$)/i,
            /\/error-reporting-proxy\//i,
            /^https?:\/\/[^/]*sentry\.io\//i,
            /^https?:\/\/[^/]*\.sentry-cdn\.com\//i
        ];
        const counts = this.__counts = { total: 0 };
        const blocked = url => {
            const s = String(url || "");
            if (!BLOCK.some(r => r.test(s))) return false;
            counts.total++;
            const k = (/(science|metrics|track|sentry|error-reporting)/i.exec(s) || ["other"])[0].toLowerCase();
            counts[k] = (counts[k] || 0) + 1;
            return true;
        };
        if (api.settings.get("blockCrashReports", true) === false) {
            BLOCK.splice(3, 3);
        }

        api.patch(window, "fetch", orig => function (input, init) {
            try {
                const url = typeof input === "string" ? input : (input && input.url) || String(input);
                if (blocked(url)) return Promise.resolve(new Response(null, { status: 204, statusText: "No Content" }));
            } catch { }
            return orig.call(this, input, init);
        });

        // XHR: pretend the request finished with 204, so callers (superagent) resolve normally.
        const finish = xhr => {
            const def = (k, v) => { try { Object.defineProperty(xhr, k, { configurable: true, get: () => v }); } catch { } };
            def("readyState", 4); def("status", 204); def("statusText", "No Content");
            def("responseText", ""); def("response", ""); def("responseURL", xhr.__bcUrl || "");
            try { xhr.getAllResponseHeaders = () => ""; xhr.getResponseHeader = () => null; } catch { }
            setTimeout(() => {
                for (const ev of ["readystatechange", "load", "loadend"]) {
                    try { xhr.dispatchEvent(new ProgressEvent(ev)); } catch { }
                }
            }, 0);
        };
        api.patch(XMLHttpRequest.prototype, "open", orig => function (method, url, ...rest) {
            try { this.__bcUrl = String(url); this.__bcBlock = blocked(url); } catch { }
            return orig.call(this, method, url, ...rest);
        });
        api.patch(XMLHttpRequest.prototype, "send", orig => function (...a) {
            if (this.__bcBlock) { finish(this); return; }
            return orig.apply(this, a);
        });
        // dispatchEvent above also triggers on* handlers (onload, onreadystatechange), as for a real request.

        if (navigator.sendBeacon) {
            api.patch(Navigator.prototype, "sendBeacon", orig => function (url, data) {
                try { if (blocked(url)) return true; } catch { }
                return orig.call(this, url, data);
            });
        }
    },

    options(api) {
        const c = this.__counts || { total: 0 };
        const parts = Object.entries(c).filter(([k]) => k !== "total").map(([k, v]) => k + ": " + v).join(", ");
        return [
            api.ui.row("Also block crash/error reports (Sentry)",
                api.ui.toggle(api.settings.get("blockCrashReports", true), v => api.settings.set("blockCrashReports", v))),
            api.ui.note("Blocked " + c.total + " request(s) this session" + (parts ? " (" + parts + ")" : "") + ". Changing the option applies after turning the plugin off and on.")
        ];
    }
});
