// beecord loader: runs in Discord's main process.
// It reads files from its own folder (renderer.js + plugins/*.js) and runs them in Discord's window.
// Writes log.txt next to itself so you can see what happened.
// Runs media.ps1 for the "Spotify Controls" plugin to bridge Windows media controls.

const electron = require("electron");
const { app, shell } = electron;
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const beecordDir = path.join(__dirname, "..");
const logsDir = path.join(beecordDir, "logs");
try { fs.mkdirSync(logsDir, { recursive: true }); } catch { }
const logFile = fs.existsSync(logsDir) ? path.join(logsDir, "log.txt") : path.join(__dirname, "log.txt");
const pluginsDir = fs.existsSync(path.join(beecordDir, "plugins"))
    ? path.join(beecordDir, "plugins")
    : path.join(__dirname, "plugins");
const log = m => { try { fs.appendFileSync(logFile, new Date().toLocaleTimeString() + "  " + m + "\n"); } catch { } };
try { fs.writeFileSync(logFile, ""); } catch { }
try { fs.mkdirSync(pluginsDir, { recursive: true }); } catch { }
log("loader started");

function listPlugins(dir = pluginsDir, prefix = "") {
    try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        const list = [];
        for (const e of entries) {
            if (e.name.startsWith("_") || e.name.startsWith(".")) continue;
            if (e.isFile() && /\.js$/i.test(e.name)) {
                list.push(prefix ? path.join(prefix, e.name).replace(/\\/g, "/") : e.name);
            } else if (e.isDirectory()) {
                const sub = listPlugins(path.join(dir, e.name), prefix ? path.join(prefix, e.name) : e.name);
                list.push(...sub);
            }
        }
        return list.sort();
    } catch (e) {
        log("cannot read plugins folder: " + e);
        return [];
    }
}

// Runs every plugin file inside the page. A broken plugin can't break the others.
let scanning = false;
async function injectPlugins(wc) {
    if (scanning || wc.isDestroyed()) return;
    scanning = true;
    try {
        const files = listPlugins();
        log("plugin files found: " + (files.join(", ") || "none"));
        for (const f of files) {
            if (wc.isDestroyed()) return;
            let code;
            try { code = fs.readFileSync(path.join(pluginsDir, f), "utf8"); }
            catch (e) { log("cannot read " + f + ": " + e); continue; }
            const name = JSON.stringify(f);
            const wrapped =
                `(function(){\n` +
                `const beecord = window.beecord || window.blxstncord;\n` +
                `const blxstncord = beecord;\n` +
                `if (!beecord) return;\n` +
                `beecord.__file = ${name};\n` +
                `try {\n${code}\n} catch(e) {\n` +
                `  beecord.__pluginError(${name}, e);\n` +
                `} finally {\n` +
                `  beecord.__file = null;\n` +
                `}\n` +
                `})();`;
            try {
                await wc.executeJavaScript(wrapped);
            } catch (e) {
                log("plugin " + f + " failed to parse/run: " + e);
                await wc.executeJavaScript(`(window.beecord||window.blxstncord)&&(window.beecord||window.blxstncord).__pluginError(${name},${JSON.stringify(String(e && e.message || e))})`).catch(() => { });
            }
        }
        if (!wc.isDestroyed()) {
            await wc.executeJavaScript(`(window.beecord||window.blxstncord)&&(window.beecord||window.blxstncord).__finishScan(${JSON.stringify(files)},${JSON.stringify(pluginsDir)})`);
        }
    } catch (e) {
        log("plugin injection error: " + e);
    } finally {
        scanning = false;
    }
}

// ---------- live reload of the plugins folder ----------
const pages = new Set();
let hotTimer = null;
function hotReload() {
    if (safeModeReason) return; // safe mode: plugin files are not loaded at all
    clearTimeout(hotTimer);
    hotTimer = setTimeout(async () => {
        for (const wc of [...pages]) {
            if (wc.isDestroyed()) { pages.delete(wc); continue; }
            if (scanning) { hotReload(); return; }
            await injectPlugins(wc);
        }
    }, 800);
}
let pluginWatcher = null;
try {
    pluginWatcher = fs.watch(pluginsDir, { recursive: true }, () => hotReload());
    log("watching the plugins folder for changes (recursive)");
} catch (e) {
    try {
        pluginWatcher = fs.watch(pluginsDir, () => hotReload());
        log("watching the plugins folder for changes");
    } catch (err) {
        log("cannot watch the plugins folder: " + err.message);
    }
}

// ---------- media bridge (Spotify Controls plugin) ----------
const mediaScript = path.join(__dirname, "media.ps1");
const mediaClients = new Set();     // webContents that asked for media updates
const mediaArtSeen = new WeakMap(); // webContents -> version of the album cover it already has
let mediaProc = null, mediaBuf = "", mediaLast = null;
let mediaArt = "", mediaArtKey = null, mediaArtVer = 0;
let mediaCmdN = 0, mediaRestarts = 0;

function mediaSend(wc, o) {
    if (wc.isDestroyed()) { mediaClients.delete(wc); return; }
    const out = Object.assign({}, o);
    delete out.art;
    if (mediaArtKey !== null && mediaArtSeen.get(wc) !== mediaArtVer) {
        out.art = mediaArt;
        mediaArtSeen.set(wc, mediaArtVer);
    }
    out.artKey = mediaArtKey;
    wc.executeJavaScript(
        `window.dispatchEvent(new CustomEvent("beecord-media",{detail:${JSON.stringify(out)}}));` +
        `window.dispatchEvent(new CustomEvent("blxstncord-media",{detail:${JSON.stringify(out)}}));`
    ).catch(() => { });
}

function mediaOnLine(line) {
    line = line.trim();
    if (!line) return;
    let o;
    try { o = JSON.parse(line); } catch { log("media: unreadable output: " + line.slice(0, 120)); return; }
    mediaRestarts = 0;
    if (o.error) log("media: " + o.error);
    if (typeof o.art === "string") { mediaArt = o.art; mediaArtKey = o.key; mediaArtVer++; }
    mediaLast = o;
    for (const wc of mediaClients) mediaSend(wc, o);
}

function mediaStart() {
    if (mediaProc) return;
    if (!fs.existsSync(mediaScript)) { log("media: media.ps1 is missing in " + __dirname); return; }
    try { for (const f of fs.readdirSync(__dirname).filter(f => /^media-.*\.cmd$/.test(f))) fs.unlinkSync(path.join(__dirname, f)); } catch { }
    mediaBuf = "";
    let p;
    try {
        p = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", mediaScript,
            "-CmdDir", __dirname, "-ParentPid", String(process.pid)], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    } catch (e) { log("media: cannot start PowerShell: " + e.message); return; }
    mediaProc = p;
    p.stdout.setEncoding("utf8");
    p.stdout.on("data", d => {
        mediaBuf += d;
        let i;
        while ((i = mediaBuf.indexOf("\n")) >= 0) { const l = mediaBuf.slice(0, i); mediaBuf = mediaBuf.slice(i + 1); mediaOnLine(l); }
    });
    p.stderr.on("data", d => log("media helper: " + String(d).trim().slice(0, 300)));
    p.on("error", e => { log("media: cannot start PowerShell: " + e.message); if (mediaProc === p) mediaProc = null; });
    p.on("exit", code => {
        const unexpected = mediaProc === p;
        if (unexpected) mediaProc = null;
        log("media: helper exited (" + code + ")");
        if (unexpected && mediaClients.size && mediaRestarts++ < 5) setTimeout(mediaStart, 3000);
    });
    log("media: helper started");
}

function mediaStopProc() {
    const p = mediaProc;
    mediaProc = null;
    if (p) { try { p.kill(); } catch { } }
}

function mediaCommand(wc, msg) {
    const m = /cmd:media:([a-z]+(?::(?:\d{1,9}|[a-z]{2,5}))?)(?![\w:])/.exec(msg);
    if (!m) return;
    const c = m[1];
    if (c === "start") {
        mediaClients.add(wc);
        mediaArtSeen.delete(wc);
        mediaStart();
        if (mediaLast) mediaSend(wc, mediaLast);
        return;
    }
    if (c === "stop") {
        mediaClients.delete(wc);
        if (!mediaClients.size) mediaStopProc();
        return;
    }
    if (!mediaClients.has(wc) || !/^(toggle|next|prev|seek:\d{1,9}|shuffle:(on|off)|repeat:(none|track|list)|volume:\d{1,3}|mute:(on|off))$/.test(c)) return;
    try { fs.writeFileSync(path.join(__dirname, "media-" + Date.now() + "-" + String(mediaCmdN++ % 1000).padStart(3, "0") + ".cmd"), c); }
    catch (e) { log("media: cannot write command: " + e.message); }
}

// ---------- disk log persistence ----------
function getCategoryFiles(cat) {
    cat = (cat || "").toLowerCase();
    if (cat.includes("server") || cat === "servers") cat = "servers";
    else if (cat.includes("dm") || cat === "dms") cat = "dms";
    else if (cat.includes("friend") || cat === "friends") cat = "friends";
    else cat = "general";

    const jsonFile = path.join(logsDir, cat + ".json");
    const humanLogFile = path.join(logsDir, cat + ".log");
    return { category: cat, jsonFile, humanLogFile };
}

function loadAllLogsFromDisk() {
    const cats = ["servers", "dms", "friends"];
    const out = {};
    for (const c of cats) {
        const file = path.join(logsDir, c + ".json");
        try {
            if (fs.existsSync(file)) {
                const data = JSON.parse(fs.readFileSync(file, "utf8"));
                out[c] = Array.isArray(data) ? data : [];
            } else {
                out[c] = [];
            }
        } catch (e) {
            out[c] = [];
        }
    }
    return out;
}

function saveLogEntryToDisk(item) {
    if (!item || !item.id) return;
    const { category, jsonFile, humanLogFile } = getCategoryFiles(item.category || (item.guild ? "servers" : (item.kind ? "friends" : "dms")));
    item.category = category;

    // 1. JSON database
    try {
        let list = [];
        if (fs.existsSync(jsonFile)) {
            try { list = JSON.parse(fs.readFileSync(jsonFile, "utf8")); } catch { list = []; }
        }
        if (!Array.isArray(list)) list = [];
        const idx = list.findIndex(x => x.id === item.id);
        if (idx >= 0) {
            list[idx] = Object.assign({}, list[idx], item);
        } else {
            list.unshift(item);
            if (list.length > 2500) list.pop();
        }
        fs.writeFileSync(jsonFile, JSON.stringify(list, null, 2), "utf8");
    } catch (e) {
        log("disk log json error: " + e.message);
    }

    // 2. Human-readable text log
    try {
        const timeStr = new Date(item.deleted || item.ts || Date.now()).toLocaleString();
        let text = "";
        if (category === "friends") {
            text = `[${timeStr}] [${item.tag || "FRIEND ACTIVITY"}] User: ${item.name || "Unknown"} (${item.where || ""})\n  ${item.text || item.content || ""}${item.note ? " | " + item.note : ""}\n`;
        } else {
            const where = item.where || (item.guild ? "Server channel" : "DM");
            text = `[${timeStr}] [DELETED MESSAGE] ${where} | Author: ${item.name || "Unknown"} (ID: ${item.author || "?"})\n  Content: ${item.content || "[no text]"}`;
            if (item.attachments && item.attachments.length) {
                text += `\n  Attachments: ` + item.attachments.map(a => a.name + (a.url ? ` (${a.url})` : "")).join(", ");
            }
            if (item.links && item.links.length) {
                text += `\n  Links: ` + item.links.join(", ");
            }
            text += "\n";
        }
        text += "--------------------------------------------------------------------------------\n";
        fs.appendFileSync(humanLogFile, text, "utf8");
    } catch (e) {
        log("disk log text error: " + e.message);
    }
}

function removeLogEntryFromDisk(category, id) {
    if (!id) return;
    const cats = category && category !== "all" ? [category] : ["servers", "dms", "friends"];
    for (const c of cats) {
        const { jsonFile } = getCategoryFiles(c);
        if (!fs.existsSync(jsonFile)) continue;
        try {
            let list = JSON.parse(fs.readFileSync(jsonFile, "utf8"));
            if (Array.isArray(list)) {
                const prev = list.length;
                list = list.filter(x => x.id !== id);
                if (list.length !== prev) {
                    fs.writeFileSync(jsonFile, JSON.stringify(list, null, 2), "utf8");
                }
            }
        } catch (e) {
            log("disk remove error: " + e.message);
        }
    }
}

function clearCategoryFromDisk(category) {
    const cats = (!category || category === "all") ? ["servers", "dms", "friends"] : [category];
    const timestamp = new Date().toLocaleString();
    for (const c of cats) {
        const { jsonFile, humanLogFile } = getCategoryFiles(c);
        try {
            fs.writeFileSync(jsonFile, "[]", "utf8");
            fs.appendFileSync(humanLogFile, `\n[${timestamp}] --- LOG CATEGORY CLEARED: ${c.toUpperCase()} ---\n\n`, "utf8");
            log("cleared disk logs for " + c);
        } catch (e) {
            log("disk clear error for " + c + ": " + e.message);
        }
    }
}

// ---------- disk config & folders persistence ----------
const configFile = path.join(beecordDir, "config.json");
const foldersFile = path.join(beecordDir, "data", "folders.json");

function loadDiskConfig() {
    try {
        if (fs.existsSync(configFile)) return JSON.parse(fs.readFileSync(configFile, "utf8"));
    } catch (e) { log("cannot read config.json: " + e); }
    return null;
}

function saveDiskConfig(data) {
    try {
        fs.writeFileSync(configFile, JSON.stringify(data, null, 2), "utf8");
    } catch (e) { log("cannot write config.json: " + e); }
}

function loadDiskFolders() {
    try {
        if (fs.existsSync(foldersFile)) return JSON.parse(fs.readFileSync(foldersFile, "utf8"));
    } catch (e) { log("cannot read folders.json: " + e); }
    return null;
}

function saveDiskFolders(data) {
    try {
        fs.writeFileSync(foldersFile, JSON.stringify(data, null, 2), "utf8");
    } catch (e) { log("cannot write folders.json: " + e); }
}

// the shared ranks registry (distributed by the repo auto-updater; read-only on clients)
const ranksFile = path.join(beecordDir, "data", "ranks.json");
function loadDiskRanks() {
    try {
        if (fs.existsSync(ranksFile)) return JSON.parse(fs.readFileSync(ranksFile, "utf8").replace(/^﻿/, ""));
    } catch (e) { log("cannot read ranks.json: " + e); }
    return null;
}

// ---- live ranks sync from the server (Cloudflare Worker); falls back to the bundled ranks.json offline ----
// Done in the main process so Discord's page CSP can't block it; results are injected + an event fired.
let ranksSyncWC = null, ranksSyncTimer = null;
function ranksServerUrl() {
    try { const r = loadDiskRanks(); if (r && typeof r.server === "string" && /^https?:\/\//.test(r.server)) return r.server.replace(/\/+$/, ""); } catch { }
    return null;
}
async function syncRanksFromServer(wc) {
    const base = ranksServerUrl();
    if (!base || typeof fetch !== "function" || !wc || wc.isDestroyed()) return;
    try {
        const res = await fetch(base + "/ranks", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (!data || typeof data !== "object" || !data.ranks) return;
        await wc.executeJavaScript(`window.__beecordRanks = Object.assign({}, window.__beecordRanks, ${JSON.stringify(data)}); window.dispatchEvent(new CustomEvent("beecord-ranks"));`).catch(() => { });
    } catch { /* offline: keep local fallback */ }
}
function startRanksSync(wc) {
    ranksSyncWC = wc;
    syncRanksFromServer(wc);
    if (!ranksSyncTimer) ranksSyncTimer = setInterval(() => syncRanksFromServer(ranksSyncWC), 3 * 60 * 1000);
}

// ---- live broadcast events (confetti / announcements / …) pushed by the owner via the server ----
// Polled more often than ranks so an event shows within ~15s. De-duped by id in the page (localStorage),
// so restarting Discord within the event's TTL doesn't replay it.
let eventPollWC = null, eventPollTimer = null, lastEventId = 0;
async function pollEvent(wc) {
    const base = ranksServerUrl();
    if (!base || typeof fetch !== "function" || !wc || wc.isDestroyed()) return;
    try {
        const res = await fetch(base + "/event", { cache: "no-store" });
        if (!res.ok) return;
        const e = await res.json();
        if (!e || !e.id || e.id === lastEventId) return;
        lastEventId = e.id;
        await wc.executeJavaScript(`window.dispatchEvent(new CustomEvent("beecord-event",{detail:${JSON.stringify(e)}}));`).catch(() => { });
    } catch { /* offline / no event endpoint yet: ignore */ }
}
function startEventPoll(wc) {
    eventPollWC = wc;
    pollEvent(wc);
    if (!eventPollTimer) eventPollTimer = setInterval(() => pollEvent(eventPollWC), 15 * 1000);
}

// ---------- themes (Themes plugin) ----------
// Local themes: %APPDATA%\beecord\themes\*.css (BetterDiscord *.theme.css works too).
// URL themes: list in themes\urls.json, downloaded copy in themes\.remote\<id>.css.
// Downloads are done here (main process) and @import / url(http...) assets are inlined as data: URIs,
// so they work under Discord's Content-Security-Policy.
const themesDir = path.join(beecordDir, "themes");
const remoteDir = path.join(themesDir, ".remote");
const urlsFile = path.join(themesDir, "urls.json");
try { fs.mkdirSync(remoteDir, { recursive: true }); } catch { }

const MAX_CSS = 8 * 1024 * 1024, MAX_ASSET = 4 * 1024 * 1024, MAX_TOTAL_ASSETS = 24 * 1024 * 1024;

function themeMeta(css, fallback) {
    const head = String(css).slice(0, 4000);
    const tag = t => { const m = new RegExp("@" + t + "[ \\t]+([^\\r\\n*]+)").exec(head); return m ? m[1].trim() : ""; };
    return { name: tag("name") || fallback, author: tag("author"), version: tag("version"), description: tag("description") };
}

function readUrlThemes() {
    try { const v = JSON.parse(fs.readFileSync(urlsFile, "utf8")); return Array.isArray(v) ? v : []; } catch { return []; }
}
function writeUrlThemes(list) {
    try { fs.writeFileSync(urlsFile, JSON.stringify(list, null, 2), "utf8"); } catch (e) { log("themes: cannot write urls.json: " + e.message); }
}

function listThemes() {
    const out = [];
    try {
        for (const f of fs.readdirSync(themesDir).sort()) {
            if (!/\.css$/i.test(f) || f.startsWith(".") || f.startsWith("_")) continue;
            const p = path.join(themesDir, f);
            let st, css = "";
            try { st = fs.statSync(p); if (!st.isFile()) continue; css = fs.readFileSync(p, "utf8"); } catch { continue; }
            out.push(Object.assign({ id: "file:" + f, source: "file", file: f, mtime: st.mtimeMs, size: st.size },
                themeMeta(css, f.replace(/(\.theme)?\.css$/i, ""))));
        }
    } catch (e) { log("themes: cannot read folder: " + e.message); }
    for (const t of readUrlThemes()) {
        const p = path.join(remoteDir, t.key + ".css");
        let st = null; try { st = fs.statSync(p); } catch { }
        out.push({ id: "url:" + t.key, source: "url", url: t.url, name: t.name || t.url, author: t.author || "", version: t.version || "",
            description: t.description || "", mtime: st ? st.mtimeMs : 0, size: st ? st.size : 0, updated: t.updated || 0, missing: !st });
    }
    return out;
}

async function httpGet(url, maxBytes, asText) {
    if (!/^https?:\/\//i.test(url)) throw new Error("only http(s) links are allowed");
    const doFetch = (electron.net && typeof electron.net.fetch === "function") ? electron.net.fetch.bind(electron.net) : fetch;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20000);
    try {
        const res = await doFetch(url, { signal: ctrl.signal, redirect: "follow" });
        if (!res.ok) throw new Error("HTTP " + res.status);
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length > maxBytes) throw new Error("file too large (" + Math.round(buf.length / 1024) + " KB)");
        return asText ? buf.toString("utf8") : { buf, type: (res.headers.get("content-type") || "").split(";")[0].trim() };
    } finally { clearTimeout(timer); }
}

const MIME = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", svg: "image/svg+xml",
    avif: "image/avif", woff: "font/woff", woff2: "font/woff2", ttf: "font/ttf", otf: "font/otf", eot: "application/vnd.ms-fontobject", mp4: "video/mp4", webm: "video/webm" };

// Inlines @import (recursively, depth 4) and http(s) url() assets of a stylesheet.
async function bundleCss(css, baseUrl, state, depth) {
    state = state || { total: 0, cache: new Map(), failed: 0 };
    depth = depth || 0;
    const abs = u => { try { return new URL(u, baseUrl).href; } catch { return null; } };
    // 1. @import url("x") / @import "x";  (media queries after the url are kept by wrapping in @media)
    const importRe = /@import\s+(?:url\(\s*(['"]?)([^'")]+)\1\s*\)|(['"])([^'"]+)\3)\s*([^;]*);/gi;
    let out = "", last = 0, m;
    while ((m = importRe.exec(css))) {
        out += css.slice(last, m.index);
        last = importRe.lastIndex;
        const target = abs(m[2] || m[4]);
        const media = (m[5] || "").trim();
        if (!target || depth >= 4 || !/^https?:/i.test(target)) { out += m[0]; continue; }
        try {
            let sub = await httpGet(target, MAX_CSS, true);
            sub = await bundleCss(sub, target, state, depth + 1);
            out += "\n/* @import " + target + " */\n" + (media ? "@media " + media + "{\n" + sub + "\n}" : sub) + "\n";
        } catch (e) { state.failed++; log("themes: @import failed " + target + ": " + e.message); out += m[0]; }
    }
    out += css.slice(last);
    css = out;
    // 2. url(...) assets  (Google Fonts css @imports already inlined above; fonts/images become data: URIs)
    const urlRe = /url\(\s*(['"]?)([^'")]+)\1\s*\)/gi;
    const targets = new Set();
    while ((m = urlRe.exec(css))) {
        const raw = m[2].trim();
        if (/^(data:|#|blob:)/i.test(raw)) continue;
        const t = abs(raw);
        if (t && /^https?:/i.test(t)) targets.add(raw);
    }
    for (const raw of targets) {
        if (state.cache.has(raw)) continue;
        const t = abs(raw);
        if (state.total >= MAX_TOTAL_ASSETS) { state.cache.set(raw, t); continue; }
        try {
            const { buf, type } = await httpGet(t, MAX_ASSET, false);
            const ext = (/\.([a-z0-9]{2,5})(?:[?#]|$)/i.exec(t) || [])[1];
            const mime = (type && type !== "application/octet-stream" && type !== "text/plain") ? type : (MIME[(ext || "").toLowerCase()] || "application/octet-stream");
            state.total += buf.length;
            state.cache.set(raw, "data:" + mime + ";base64," + buf.toString("base64"));
        } catch (e) { state.failed++; state.cache.set(raw, t); log("themes: asset failed " + t + ": " + e.message); }
    }
    return css.replace(urlRe, (all, q, raw) => {
        const v = state.cache.get(raw.trim());
        return v ? 'url("' + v + '")' : all;
    });
}

async function downloadUrlTheme(url) {
    const key = crypto.createHash("sha1").update(url).digest("hex").slice(0, 12);
    const raw = await httpGet(url, MAX_CSS, true);
    if (/^\s*<(!doctype|html)/i.test(raw)) throw new Error("this link is a web page, not a .css file (use the raw link)");
    const state = { total: 0, cache: new Map(), failed: 0 };
    const css = await bundleCss(raw, url, state, 0);
    fs.writeFileSync(path.join(remoteDir, key + ".css"), css, "utf8");
    const meta = themeMeta(raw, decodeURIComponent(url.split(/[?#]/)[0].split("/").pop() || url).replace(/(\.theme)?\.css$/i, ""));
    const list = readUrlThemes().filter(t => t.key !== key && t.url !== url);
    list.push(Object.assign({ key, url, updated: Date.now() }, meta));
    writeUrlThemes(list);
    return { id: "url:" + key, name: meta.name, failed: state.failed };
}

// Local files often are BetterDiscord "loader" stubs: a few variables + @import url(https://...real theme...).
// Discord's CSP blocks remote @import/url() inside the page, so local files are bundled too (cached by name+mtime+size).
const cacheDir = path.join(themesDir, ".cache");
const bundling = new Map();
const needsBundle = css => /@import\s+(url\()?\s*['"]?\s*(https?:)?\/\//i.test(css) || /url\(\s*['"]?\s*https?:\/\//i.test(css);
async function themeCss(id) {
    if (id.startsWith("url:")) return fs.readFileSync(path.join(remoteDir, path.basename(id.slice(4)) + ".css"), "utf8");
    if (!id.startsWith("file:")) throw new Error("unknown theme");
    const f = path.basename(id.slice(5));
    const p = path.join(themesDir, f);
    const st = fs.statSync(p);
    const raw = fs.readFileSync(p, "utf8");
    if (!needsBundle(raw)) return raw;
    const prefix = f.replace(/[^\w.+-]/g, "_") + "-";
    const key = prefix + crypto.createHash("sha1").update(f + "|" + st.mtimeMs + "|" + st.size).digest("hex").slice(0, 12) + ".css";
    const cached = path.join(cacheDir, key);
    try { return fs.readFileSync(cached, "utf8"); } catch { }
    if (bundling.has(key)) return bundling.get(key);
    const job = (async () => {
        const state = { total: 0, cache: new Map(), failed: 0 };
        const css = await bundleCss(raw, undefined, state, 0); // no base: relative paths stay as they are
        try {
            fs.mkdirSync(cacheDir, { recursive: true });
            for (const old of fs.readdirSync(cacheDir)) if (old.startsWith(prefix) && old !== key) fs.rmSync(path.join(cacheDir, old), { force: true });
            // keep the bundle only if every download worked, so a temporary network error is retried next time
            if (!state.failed) fs.writeFileSync(cached, css, "utf8");
        } catch (e) { log("themes: cannot write cache: " + e.message); }
        log("themes: bundled local " + f + " (" + Math.round(css.length / 1024) + " KB" + (state.failed ? ", " + state.failed + " download(s) failed" : "") + ")");
        return css;
    })();
    bundling.set(key, job);
    try { return await job; } finally { bundling.delete(key); }
}

function themesSend(wc, detail) {
    if (!wc || wc.isDestroyed()) return;
    wc.executeJavaScript(`window.dispatchEvent(new CustomEvent("beecord-themes",{detail:${JSON.stringify(detail)}}));`).catch(() => { });
}
function themesBroadcastList() { for (const wc of pages) themesSend(wc, { type: "list", themes: listThemes(), dir: themesDir }); }

async function themesCommand(wc, msg) {
    const i = msg.indexOf("cmd:themes:");
    const rest = msg.slice(i + 11);
    const sep = rest.indexOf(":");
    const op = sep < 0 ? rest.trim() : rest.slice(0, sep);
    let arg = {};
    if (sep >= 0) { try { arg = JSON.parse(rest.slice(sep + 1)); } catch { arg = {}; } }
    try {
        if (op === "list") return themesSend(wc, { type: "list", themes: listThemes(), dir: themesDir });
        if (op === "open-folder") { shell.openPath(themesDir); return; }
        if (op === "get") {
            let css = "";
            try { css = await themeCss(String(arg.id || "")); } catch (e) { return themesSend(wc, { type: "css", id: arg.id, error: e.message }); }
            return themesSend(wc, { type: "css", id: arg.id, css });
        }
        if (op === "add-url" || op === "update") {
            let url = String(arg.url || "").trim();
            if (op === "update") { const t = readUrlThemes().find(x => "url:" + x.key === arg.id); if (!t) throw new Error("theme not found"); url = t.url; }
            // GitHub "blob" page -> raw file
            const gh = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/(.+)$/i.exec(url);
            if (gh) url = "https://raw.githubusercontent.com/" + gh[1] + "/" + gh[2] + "/" + gh[3];
            themesSend(wc, { type: "status", busy: true, msg: "Downloading " + url + " …" });
            const r = await downloadUrlTheme(url);
            log("themes: downloaded " + url + " -> " + r.id);
            themesBroadcastList();
            for (const p of pages) themesSend(p, { type: "css-changed", id: r.id });
            return themesSend(wc, { type: "status", ok: true, added: op === "add-url" ? r.id : null,
                msg: (op === "add-url" ? "Added: " : "Updated: ") + r.name + (r.failed ? " (" + r.failed + " asset(s) could not be downloaded)" : "") });
        }
        if (op === "remove") {
            const id = String(arg.id || "");
            if (id.startsWith("url:")) {
                const key = path.basename(id.slice(4));
                writeUrlThemes(readUrlThemes().filter(t => t.key !== key));
                try { fs.rmSync(path.join(remoteDir, key + ".css"), { force: true }); } catch { }
            } else if (id.startsWith("file:")) {
                // local files are moved to themes\.trash instead of being deleted
                const f = path.basename(id.slice(5));
                const trash = path.join(themesDir, ".trash");
                fs.mkdirSync(trash, { recursive: true });
                fs.renameSync(path.join(themesDir, f), path.join(trash, Date.now() + "-" + f));
            }
            themesBroadcastList();
            return themesSend(wc, { type: "status", ok: true, msg: "Removed." });
        }
        if (op === "import-file") {
            const win = electron.BrowserWindow.fromWebContents(wc);
            const res = await electron.dialog.showOpenDialog(win, { title: "Import theme (.css)", properties: ["openFile", "multiSelections"],
                filters: [{ name: "CSS themes", extensions: ["css"] }] });
            if (res.canceled || !res.filePaths.length) return;
            const added = [];
            for (const src of res.filePaths) {
                const name = path.basename(src);
                fs.copyFileSync(src, path.join(themesDir, name));
                added.push("file:" + name);
            }
            themesBroadcastList();
            for (const p of pages) for (const id of added) themesSend(p, { type: "css-changed", id });
            return themesSend(wc, { type: "status", ok: true, addedMany: added, msg: "Imported " + added.length + " file(s)." });
        }
    } catch (e) {
        log("themes: " + op + " failed: " + e.message);
        themesSend(wc, { type: "status", error: true, msg: "Error: " + e.message });
    }
}

let themesTimer = null;
try {
    fs.watch(themesDir, (ev, f) => {
        if (f && (String(f).startsWith(".") || String(f) === "urls.json")) return;
        clearTimeout(themesTimer);
        themesTimer = setTimeout(() => {
            themesBroadcastList();
            if (f) for (const p of pages) themesSend(p, { type: "css-changed", id: "file:" + f });
        }, 300);
    });
} catch (e) { log("themes: cannot watch folder: " + e.message); }

let fontB64 = null;
const safeCall = f => { try { return f(); } catch { return null; } };

// deployed beecord version: the commit the auto-updater last installed (written by watcher.js),
// plus the configured repo it tracks, so the panel can show what you're running.
function readBeecordVersion() {
    const out = { sha: null, at: null, repo: null, branch: null };
    const readJson = f => JSON.parse(fs.readFileSync(f, "utf8").replace(/^﻿/, ""));   // tolerate a UTF-8 BOM
    try { const s = readJson(path.join(logsDir, "update-state.json")); out.sha = s.sha || null; out.at = s.at || null; } catch { }
    try { const c = readJson(path.join(beecordDir, "data", "update.json")); if (c && c.owner && c.repo) { out.repo = c.owner + "/" + c.repo; out.branch = c.branch || "main"; } } catch { }
    return out;
}

// ---------- safe mode ----------
// Starts Discord with beecord's panel only (no plugins, no themes) when
//  - the file %APPDATA%\beecord\safe-mode exists (data\safe-mode.bat creates it), or
//  - the last 3 starts never reached "boot-ok" (a plugin froze or crashed Discord).
const safeFile = path.join(beecordDir, "safe-mode");
const bootFile = path.join(logsDir, "boot.json");
const readBoot = () => { try { return JSON.parse(fs.readFileSync(bootFile, "utf8")) || {}; } catch { return {}; } };
const writeBoot = o => { try { fs.writeFileSync(bootFile, JSON.stringify(o)); } catch { } };
let safeModeReason = null;
function checkSafeMode() {
    if (fs.existsSync(safeFile)) return (safeModeReason = "manual");
    if ((readBoot().pending || 0) >= 3) { writeBoot({ pending: 0, at: Date.now() }); return (safeModeReason = "crash"); }
    return (safeModeReason = null);
}

// ---------- settings export / import ----------
async function exportSettings(wc) {
    const win = electron.BrowserWindow.fromWebContents(wc);
    const stamp = new Date().toISOString().slice(0, 10);
    const res = await electron.dialog.showSaveDialog(win, { title: "Export beecord settings", defaultPath: "beecord-settings-" + stamp + ".json",
        filters: [{ name: "beecord settings", extensions: ["json"] }] });
    if (res.canceled || !res.filePath) return { ok: false, msg: "Cancelled." };
    const data = { beecord: 1, exported: new Date().toISOString(), config: loadDiskConfig(), folders: loadDiskFolders(), urlThemes: readUrlThemes() };
    fs.writeFileSync(res.filePath, JSON.stringify(data, null, 2), "utf8");
    return { ok: true, msg: "Exported to " + res.filePath };
}
async function importSettings(wc) {
    const win = electron.BrowserWindow.fromWebContents(wc);
    const res = await electron.dialog.showOpenDialog(win, { title: "Import beecord settings", properties: ["openFile"],
        filters: [{ name: "beecord settings", extensions: ["json"] }] });
    if (res.canceled || !res.filePaths.length) return { ok: false, msg: "Cancelled." };
    let data;
    try { data = JSON.parse(fs.readFileSync(res.filePaths[0], "utf8")); } catch (e) { return { ok: false, msg: "Not a valid JSON file: " + e.message }; }
    const c = data && data.config;
    if (!data || data.beecord !== 1 || !c || typeof c !== "object" || typeof (c.enabled || {}) !== "object" || typeof (c.settings || {}) !== "object") {
        return { ok: false, msg: "This is not a beecord settings export." };
    }
    // keep a backup of the current settings next to config.json
    try { if (fs.existsSync(configFile)) fs.copyFileSync(configFile, path.join(beecordDir, "config.backup-" + Date.now() + ".json")); } catch { }
    saveDiskConfig({ enabled: c.enabled || {}, settings: c.settings || {}, themes: Array.isArray(c.themes) ? c.themes : [], flags: c.flags || {} });
    if (data.folders) saveDiskFolders(data.folders);
    if (Array.isArray(data.urlThemes)) {
        const have = readUrlThemes();
        for (const t of data.urlThemes) if (t && t.key && t.url && !have.some(x => x.key === t.key)) have.push(t);
        writeUrlThemes(have);
    }
    setTimeout(() => { if (!wc.isDestroyed()) wc.reload(); }, 400);
    return { ok: true, msg: "Imported. Reloading Discord…" };
}
function replyTo(wc, detail) {
    if (!wc || wc.isDestroyed()) return;
    wc.executeJavaScript(`window.dispatchEvent(new CustomEvent("beecord-core",{detail:${JSON.stringify(detail)}}));`).catch(() => { });
}

app.on("will-quit", mediaStopProc);

app.on("browser-window-created", (_event, win) => {
    pages.add(win.webContents);

    win.webContents.on("console-message", (...args) => {
        const msg = typeof args[2] === "string" ? args[2] : (args[0] && args[0].message);
        if (typeof msg !== "string" || (!msg.includes("[beecord]") && !msg.includes("[blxstncord]"))) return;
        if (msg.includes("cmd:themes:")) { themesCommand(win.webContents, msg); return; }
        if (msg.includes("cmd:boot-ok")) { writeBoot({ pending: 0, at: Date.now() }); return; }
        if (msg.includes("cmd:safe-mode:")) {
            const on = /cmd:safe-mode:on\b/.test(msg);
            try { if (on) fs.writeFileSync(safeFile, "delete this file (or use the button in beecord > Status) to leave safe mode\r\n"); else fs.rmSync(safeFile, { force: true }); } catch (e) { log("safe-mode: " + e.message); }
            writeBoot({ pending: 0, at: Date.now() });
            log("safe mode " + (on ? "ON" : "OFF") + " (requested from the page), reloading");
            setTimeout(() => { if (!win.webContents.isDestroyed()) win.webContents.reload(); }, 200);
            return;
        }
        if (msg.includes("cmd:settings:export") || msg.includes("cmd:settings:import")) {
            const fn = msg.includes("cmd:settings:export") ? exportSettings : importSettings;
            fn(win.webContents).then(r => replyTo(win.webContents, Object.assign({ type: "settings" }, r)),
                e => replyTo(win.webContents, { type: "settings", ok: false, msg: "Failed: " + e.message }));
            return;
        }
        if (msg.includes("cmd:open-root-folder")) { shell.openPath(beecordDir); return; }
        if (msg.includes("cmd:window:")) {
            const m = /cmd:window:(top:(?:on|off)|opacity:\d{1,3}|minimize)(?![\w:])/.exec(msg);
            if (m && !win.isDestroyed()) {
                const [op, v] = m[1].split(":");
                try {
                    if (op === "minimize") win.minimize();
                    else if (op === "top") win.setAlwaysOnTop(v === "on", "floating");
                    else win.setOpacity(Math.min(100, Math.max(20, Number(v))) / 100);
                } catch (e) { log("window cmd failed: " + e.message); }
            }
            return;
        }
        if (msg.includes("cmd:rescan")) { if (!safeModeReason) injectPlugins(win.webContents); return; }
        if (msg.includes("cmd:open-folder")) { shell.openPath(pluginsDir); return; }
        if (msg.includes("cmd:open-logs-folder")) { shell.openPath(logsDir); return; }
        if (msg.includes("cmd:media:")) { mediaCommand(win.webContents, msg); return; }
        if (msg.includes("cmd:save-config:")) {
            try {
                const idx = msg.indexOf("cmd:save-config:");
                saveDiskConfig(JSON.parse(msg.slice(idx + 16)));
            } catch (e) { log("save-config err: " + e.message); }
            return;
        }
        if (msg.includes("cmd:save-folders:")) {
            try {
                const idx = msg.indexOf("cmd:save-folders:");
                saveDiskFolders(JSON.parse(msg.slice(idx + 17)));
            } catch (e) { log("save-folders err: " + e.message); }
            return;
        }
        if (msg.includes("cmd:ranks:seen:")) {
            // a beecord client registering its OWN user id + profile as an active beecord user (no admin key)
            try {
                const raw = msg.slice(msg.indexOf("cmd:ranks:seen:") + 15).trim();
                let payload; try { payload = JSON.parse(raw); } catch { payload = /^\d{15,22}$/.test(raw) ? { userId: raw } : null; }
                const base = ranksServerUrl();
                if (base && payload && /^\d{15,22}$/.test(String(payload.userId || "")) && typeof fetch === "function") {
                    fetch(base + "/seen", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }).catch(() => { });
                }
            } catch { }
            return;
        }
        if (msg.includes("cmd:log-entry:")) {
            try {
                const idx = msg.indexOf("cmd:log-entry:");
                saveLogEntryToDisk(JSON.parse(msg.slice(idx + 14)));
            } catch (e) { log("log-entry parse err: " + e.message); }
            return;
        }
        if (msg.includes("cmd:log-remove:")) {
            try {
                const idx = msg.indexOf("cmd:log-remove:");
                const data = JSON.parse(msg.slice(idx + 15));
                removeLogEntryFromDisk(data.category, data.id);
            } catch (e) { log("log-remove parse err: " + e.message); }
            return;
        }
        if (msg.includes("cmd:log-clear:")) {
            try {
                const idx = msg.indexOf("cmd:log-clear:");
                clearCategoryFromDisk(msg.slice(idx + 14).trim());
            } catch (e) { log("log-clear err: " + e.message); }
            return;
        }
        log(msg);
    });

    win.webContents.on("destroyed", () => {
        mediaClients.delete(win.webContents);
        pages.delete(win.webContents);
    });

    win.webContents.on("dom-ready", async () => {
        try {
            mediaArtSeen.delete(win.webContents);
            const url = win.webContents.getURL();
            if (!/discord\.com/.test(url)) return;
            // Discord's in-game overlay is a separate discord.com webContents. Don't inject there, or beecord's
            // HUDs (Spotify card, clock, etc.) render on top of the game.
            if (/(^|\/|\.)overlay(\/|$|\?|#|\.)/i.test(url)) { log("skipping Discord overlay: " + url); return; }
            log("injecting into " + url);
            // UI font (JetBrains Mono, OFL) is handed over as base64 and loaded with the FontFace API
            // (binary source -> not affected by Discord's font-src CSP)
            try {
                if (fontB64 === null) {
                    const fp = path.join(beecordDir, "assets", "fonts", "JetBrainsMono.ttf");
                    fontB64 = fs.existsSync(fp) ? fs.readFileSync(fp).toString("base64") : "";
                }
                if (fontB64) await win.webContents.executeJavaScript(`window.__beecordFont = ${JSON.stringify(fontB64)};`).catch(() => { });
            } catch (e) { log("font: " + e.message); }
            const diskLogs = loadAllLogsFromDisk();
            const diskConfig = loadDiskConfig();
            const diskFolders = loadDiskFolders();
            const diskRanks = loadDiskRanks();
            const safe = checkSafeMode();
            const ver = readBeecordVersion();
            const info = { discord: safeCall(() => app.getVersion()), electron: process.versions.electron, chrome: process.versions.chrome,
                dir: beecordDir, safeMode: safe, bootFailures: readBoot().pending || 0,
                version: ver.sha, versionAt: ver.at, repo: ver.repo, branch: ver.branch };
            await win.webContents.executeJavaScript(
                `window.__beecordDiskLogs = ${JSON.stringify(diskLogs)};\n` +
                `window.__beecordDiskConfig = ${JSON.stringify(diskConfig)};\n` +
                `window.__beecordDiskFolders = ${JSON.stringify(diskFolders)};\n` +
                `window.__beecordRanks = ${JSON.stringify(diskRanks)};\n` +
                `window.__beecordInfo = ${JSON.stringify(info)};`
            ).catch(() => {});
            startRanksSync(win.webContents);   // pull live ranks from the server + keep them fresh
            startEventPoll(win.webContents);   // pull live broadcast events (confetti / announcements / …)
            const code = fs.readFileSync(path.join(__dirname, "renderer.js"), "utf8");
            await win.webContents.executeJavaScript(code);
            if (safe) {
                log("SAFE MODE (" + safe + "): plugins and themes are not loaded");
                await win.webContents.executeJavaScript(`(window.beecord||window.blxstncord)&&(window.beecord||window.blxstncord).__finishScan([],${JSON.stringify(pluginsDir)})`).catch(() => { });
            } else {
                // counted as a failed start until the page reports "boot-ok" (after the plugins ran for 20 s)
                writeBoot({ pending: (readBoot().pending || 0) + 1, at: Date.now() });
                await injectPlugins(win.webContents);
            }
        } catch (e) {
            log("loader error: " + e);
        }
    });
});
