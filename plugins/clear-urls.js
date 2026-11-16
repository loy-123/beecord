// Clear URLs: removes tracking parameters (utm_*, fbclid, si=, igsh=, …) from links in messages you send or edit.
// Works on the outgoing HTTP request (POST/PATCH /channels/<id>/messages), so it does not depend on Discord's modules.
(window.beecord || window.blxstncord).definePlugin({
    id: "clear-urls",
    name: "Clear URLs",
    description: "Strips tracking junk (utm_*, fbclid, YouTube/Spotify si=, Instagram igsh=, …) from links before your message is sent.",
    author: "beecord",
    version: "1.0.0",
    enabledByDefault: true,
    webpack: false,

    start(api) {
        const MSG = /\/channels\/\d+\/messages(?:\/\d+)?(?:[?#]|$)/;
        const GLOBAL = [/^utm_/i, /^(fbclid|gclid|gclsrc|dclid|msclkid|yclid|twclid|ttclid|li_fat_id|wbraid|gbraid|mc_cid|mc_eid|_hsenc|_hsmi|__hssc|__hstc|__hsfp|hsCtaTracking|oly_anon_id|oly_enc_id|vero_id|mkt_tok|igshid|igsh|ref_src|ref_url|spm|scm|trk|trkCampaign|sc_cid|s_cid|cmpid|campaign_id|ad_id|adset_id)$/i];
        const PER_HOST = [
            [/(^|\.)(youtube\.com|youtu\.be|music\.youtube\.com)$/i, /^(si|feature|pp|embeds_referring_euri|source_ve_path)$/i],
            [/(^|\.)spotify\.com$/i, /^(si|context|pt|pi|nd|_branch_match_id|_branch_referrer)$/i],
            [/(^|\.)(twitter\.com|x\.com|fxtwitter\.com|vxtwitter\.com)$/i, /^(s|t|ref_src|ref_url)$/i],
            [/(^|\.)instagram\.com$/i, /^(igsh|igshid|img_index|utm_source)$/i],
            [/(^|\.)(tiktok\.com)$/i, /^(_r|_t|is_from_webapp|sender_device|sender_web_id|share_app_id|share_item_id|share_link_id|social_sharing|tt_from|u_code|user_id|web_id|is_copy_url)$/i],
            [/(^|\.)reddit\.com$/i, /^(share_id|utm_name|rdt|correlation_id|ref|ref_campaign|ref_source)$/i],
            [/(^|\.)(amazon\.[a-z.]+)$/i, /^(ref|ref_|pf_rd_[a-z]+|pd_rd_[a-z]+|linkCode|tag|content-id|crid|sprefix|qid|sr|dib|dib_tag|keywords)$/i],
            [/(^|\.)(aliexpress\.[a-z.]+)$/i, /^(spm|scm|algo_[a-z]+|aff_[a-z]+|sk|gatewayAdapt|_randl_[a-z]+|pdp_[a-z_]+)$/i],
            [/(^|\.)facebook\.com$/i, /^(mibextid|rdid|share_url|sfnsn|__tn__|__cft__\[0\])$/i]
        ];
        let cleaned = 0;

        const cleanUrl = raw => {
            let u;
            try { u = new URL(raw); } catch { return raw; }
            if (!u.search) return raw;
            const host = u.hostname;
            const extra = PER_HOST.filter(([h]) => h.test(host)).map(([, p]) => p);
            let changed = false;
            for (const key of [...u.searchParams.keys()]) {
                if (GLOBAL.some(r => r.test(key)) || extra.some(r => r.test(key))) { u.searchParams.delete(key); changed = true; }
            }
            if (!changed) return raw;
            cleaned++;
            let out = u.origin + u.pathname + (u.searchParams.toString() ? "?" + u.searchParams.toString() : "") + u.hash;
            // keep the exact form of a bare domain the user typed (no forced trailing "/")
            if (!/^[a-z]+:\/\/[^/?#]+\//i.test(raw) && u.pathname === "/") out = out.replace(/^([a-z]+:\/\/[^/?#]+)\//i, "$1");
            return out;
        };
        // skip text inside `code` and ```code blocks```
        const cleanText = text => {
            if (typeof text !== "string" || !/https?:\/\//i.test(text)) return text;
            return text.split(/(```[\s\S]*?```|`[^`\n]*`)/).map((part, i) => i % 2 ? part
                : part.replace(/https?:\/\/[^\s<>"'`]+/gi, m => {
                    const trail = /[)\].,!?:;]+$/.exec(m);  // punctuation right after a link is not part of it
                    const core = trail ? m.slice(0, -trail[0].length) : m;
                    return cleanUrl(core) + (trail ? trail[0] : "");
                })).join("");
        };
        const cleanJson = s => {
            try {
                const o = JSON.parse(s);
                if (!o || typeof o.content !== "string") return s;
                const c = cleanText(o.content);
                if (c === o.content) return s;
                o.content = c;
                return JSON.stringify(o);
            } catch { return s; }
        };
        const cleanBody = body => {
            if (typeof body === "string") return cleanJson(body);
            if (typeof FormData !== "undefined" && body instanceof FormData && typeof body.get("payload_json") === "string") {
                body.set("payload_json", cleanJson(body.get("payload_json")));
            }
            return body;
        };
        const isMsg = (method, url) => (method === "POST" || method === "PATCH") && MSG.test(String(url));

        api.patch(window, "fetch", orig => function (input, init) {
            try {
                const method = String((init && init.method) || (input && input.method) || "GET").toUpperCase();
                const url = typeof input === "string" ? input : (input && input.url) || String(input);
                if (init && init.body != null && isMsg(method, url)) init = Object.assign({}, init, { body: cleanBody(init.body) });
            } catch { }
            return orig.call(this, input, init);
        });
        api.patch(XMLHttpRequest.prototype, "open", orig => function (method, url, ...rest) {
            try { this.__bcClean = isMsg(String(method).toUpperCase(), url); } catch { }
            return orig.call(this, method, url, ...rest);
        });
        api.patch(XMLHttpRequest.prototype, "send", orig => function (body) {
            if (this.__bcClean) { try { body = cleanBody(body); } catch { } }
            return orig.call(this, body);
        });

        this.__count = () => cleaned;
        (window.beecord || window.blxstncord).clearUrl = cleanText;
        api.cleanup(() => { delete (window.beecord || window.blxstncord).clearUrl; });
    },

    options(api) {
        const n = typeof this.__count === "function" ? this.__count() : 0;
        return [api.ui.note("Cleaned " + n + " link(s) this session. Test in the console (Ctrl+Shift+I): beecord.clearUrl(\"https://youtu.be/abc?si=xyz\")")];
    }
});
