// beecord background watcher & auto-updater (runs silently via Windows Startup).
// 1. Auto-update from the project's GitHub repo (configured in data\update.json). No git needed on the client:
//    it checks the repo's latest commit, and on a change downloads the branch zip, extracts it with tar.exe,
//    and refreshes plugins/data/assets in %APPDATA%\beecord. Plugin changes apply live; core (loader/renderer)
//    changes re-patch + restart Discord. User settings, logs and personal themes are never overwritten.
// 2. Checks Discord every 10 seconds: if Discord updates to a new app-x.y.z, re-applies the patch & restarts.

const fs = require("fs");
const path = require("path");
const { execFileSync, spawn } = require("child_process");
const os = require("os");

const MARKER = "/*BEECORD*/";
const LEGACY_MARKERS = ["/*BLXSTNCORD*/", "/*FAKECORD*/"];
const isPatched = s => s.startsWith(MARKER) || LEGACY_MARKERS.some(m => s.startsWith(m));
const discordDir = path.join(process.env.LOCALAPPDATA || "", "Discord");
const beecordDir = path.join(process.env.APPDATA || "", "beecord");
const dataDir = path.join(beecordDir, "data");
const logsDir = path.join(beecordDir, "logs");
const pluginsDir = path.join(beecordDir, "plugins");
const loaderPath = path.join(dataDir, "loader.js");
const pidFile = path.join(logsDir, "watcher.pid");
const logFile = path.join(logsDir, "updater.log");
const versionFile = path.join(logsDir, "version.json");
try { fs.mkdirSync(logsDir, { recursive: true }); } catch { }

const DISCORD_CHECK_INTERVAL = 10000;
const updateConfigFile = path.join(dataDir, "update.json");
const updateStateFile = path.join(logsDir, "update-state.json");

function log(m) {
    try {
        let old = "";
        try { old = fs.readFileSync(logFile, "utf8"); } catch { }
        const lines = old.split("\n").filter(Boolean).slice(-200);
        lines.push(new Date().toLocaleString() + "  " + m);
        fs.writeFileSync(logFile, lines.join("\n") + "\n");
    } catch { }
}

function cmpVersion(a, b) {
    const pa = a.replace("app-", "").split(".").map(Number);
    const pb = b.replace("app-", "").split(".").map(Number);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const d = (pa[i] || 0) - (pb[i] || 0);
        if (d) return d;
    }
    return 0;
}

function findCoreFiles() {
    if (!fs.existsSync(discordDir)) return [];
    const apps = fs.readdirSync(discordDir).filter(d => /^app-\d/.test(d)).sort((a, b) => cmpVersion(b, a));
    const found = [];
    for (const app of apps) {
        const modDir = path.join(discordDir, app, "modules");
        if (!fs.existsSync(modDir)) continue;
        for (const m of fs.readdirSync(modDir).filter(d => d.startsWith("discord_desktop_core"))) {
            const file = path.join(modDir, m, "discord_desktop_core", "index.js");
            if (fs.existsSync(file)) found.push(file);
        }
    }
    return found;
}

function findDiscordExe() {
    try {
        const apps = fs.readdirSync(discordDir).filter(d => /^app-/.test(d)).sort(cmpVersion).reverse();
        for (const app of apps) {
            const p = path.join(discordDir, app, "Discord.exe");
            if (fs.existsSync(p)) return p;
        }
    } catch { }
    return null;
}

function isDiscordRunning() {
    try {
        return /Discord\.exe/i.test(execFileSync("tasklist", ["/fi", "imagename eq Discord.exe", "/fo", "csv", "/nh"], { encoding: "utf8", windowsHide: true }));
    } catch { return false; }
}

function restartDiscord() {
    log("Wymuszenie restartu Discorda w celu wdrozenia aktualizacji...");
    try {
        execFileSync("taskkill", ["/f", "/im", "Discord.exe"], { windowsHide: true, stdio: "ignore" });
    } catch { }

    setTimeout(() => {
        const updateExe = path.join(discordDir, "Update.exe");
        let started = false;
        if (fs.existsSync(updateExe)) {
            try {
                spawn(updateExe, ["--processStart", "Discord.exe"], { detached: true, stdio: "ignore", windowsHide: true }).unref();
                started = true;
            } catch (e) {
                log("Update.exe error: " + e.message);
            }
        }
        if (!started) {
            const exe = findDiscordExe();
            if (exe) {
                try {
                    spawn(exe, [], { detached: true, stdio: "ignore", windowsHide: true }).unref();
                    started = true;
                } catch (e) {
                    log("Direct Discord.exe error: " + e.message);
                }
            }
        }
        log("Discord zrestartowany pomyslnie.");
    }, 2000);
}

// Sprawdza czy Discord jest spatchowany. Zwraca true jesli dokonal zmian.
function checkDiscordPatch() {
    if (!fs.existsSync(loaderPath)) return false;
    const files = findCoreFiles();
    if (!files.length) return false;
    const file = files[0];
    let original;
    try { original = fs.readFileSync(file, "utf8"); } catch { return false; }
    const normOrig = original.replace(/\\\\/g, "/").replace(/\\/g, "/");
    const normLoader = loaderPath.replace(/\\/g, "/");
    const normRootLoader = path.join(beecordDir, "loader.js").replace(/\\/g, "/");
    if (original.startsWith(MARKER) && (normOrig.includes(normLoader) || normOrig.includes(normRootLoader))) return false;

    let clean = original;
    if (isPatched(original)) {
        for (const suffix of [".beecord.bak", ".blxstncord.bak", ".fakecord.bak"]) {
            const bak = file + suffix;
            if (fs.existsSync(bak)) { clean = fs.readFileSync(bak, "utf8"); break; }
        }
        if (isPatched(clean)) {
            clean = "module.exports = require('./core.asar');\n";
        }
    } else {
        fs.writeFileSync(file + ".beecord.bak", clean);
    }
    fs.writeFileSync(file, `${MARKER}\nrequire(${JSON.stringify(loaderPath)});\n${clean}`);
    log("Spatchowano nowy folder Discorda: " + file);
    return true;
}

// ---------- auto-update from the project's GitHub repo (no git needed on the client) ----------
const readJsonFile = f => JSON.parse(fs.readFileSync(f, "utf8").replace(/^﻿/, ""));   // tolerate a UTF-8 BOM (e.g. update.json edited in Notepad)
function readUpdateConfig() {
    try { return readJsonFile(updateConfigFile); } catch { return null; }
}
function readUpdateState() {
    try { return readJsonFile(updateStateFile); } catch { return {}; }
}
function writeUpdateState(s) {
    try { fs.writeFileSync(updateStateFile, JSON.stringify(s)); } catch { }
}
// copy every file from srcDir into dstDir (recursive), only writing files whose bytes changed.
// onlyExt (e.g. [".css"]) limits which files are considered. Returns the list of files actually written.
function copyDirInto(srcDir, dstDir, onlyExt) {
    const changed = [];
    if (!fs.existsSync(srcDir)) return changed;
    try { fs.mkdirSync(dstDir, { recursive: true }); } catch { }
    for (const name of fs.readdirSync(srcDir)) {
        const s = path.join(srcDir, name), d = path.join(dstDir, name);
        let st; try { st = fs.statSync(s); } catch { continue; }
        if (st.isDirectory()) { changed.push(...copyDirInto(s, d, onlyExt)); continue; }
        if (onlyExt && !onlyExt.some(e => name.toLowerCase().endsWith(e))) continue;
        let buf; try { buf = fs.readFileSync(s); } catch { continue; }
        let old = null; try { old = fs.readFileSync(d); } catch { }
        if (!old || !old.equals(buf)) { try { fs.writeFileSync(d, buf); changed.push(d); } catch (e) { log("[Update] could not write " + name + ": " + e.message); } }
    }
    return changed;
}
// Extract a .zip on Windows. tar.exe reads an argument like "C:\x.zip" as a remote host ("host:path"),
// failing with "Cannot connect to C:", so we run it from the archive's folder with bare filenames.
// Falls back to PowerShell's Expand-Archive, which handles drive-letter paths fine.
function extractZip(zip, dir) {
    try {
        execFileSync("tar.exe", ["-xf", path.basename(zip), "-C", path.basename(dir)],
            { windowsHide: true, cwd: path.dirname(zip) });
        return;
    } catch (e1) {
        try {
            execFileSync("powershell.exe",
                ["-NoProfile", "-NonInteractive", "-Command",
                    "Expand-Archive -LiteralPath " + JSON.stringify(zip) + " -DestinationPath " + JSON.stringify(dir) + " -Force"],
                { windowsHide: true });
            return;
        } catch (e2) {
            throw new Error("extract failed (tar: " + (e1 && e1.message) + "; ps: " + (e2 && e2.message) + ")");
        }
    }
}
async function ghFetch(url, token, asBuffer) {
    if (typeof fetch !== "function") throw new Error("this Node is too old (needs built-in fetch, Node 18+)");
    const headers = { "User-Agent": "beecord-updater", "Accept": asBuffer ? "application/octet-stream" : "application/vnd.github+json" };
    if (token) headers.Authorization = "Bearer " + token;
    const res = await fetch(url, { headers, redirect: "follow" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    return asBuffer ? Buffer.from(await res.arrayBuffer()) : res.json();
}

let isSyncing = false;
async function syncFromRepo(force) {
    if (isSyncing) return;
    const cfg = readUpdateConfig();
    if (!cfg || cfg.enabled === false || !cfg.owner || !cfg.repo || /YOUR_GITHUB/i.test(String(cfg.owner))) return; // not configured yet
    isSyncing = true;
    const tmpZip = path.join(os.tmpdir(), "beecord-update.zip");
    const tmpDir = path.join(os.tmpdir(), "beecord-update-" + process.pid);
    try {
        const branch = cfg.branch || "main";
        let latest;
        try { latest = (await ghFetch(`https://api.github.com/repos/${cfg.owner}/${cfg.repo}/commits/${encodeURIComponent(branch)}?per_page=1`, cfg.token)).sha; }
        catch { return; } // offline / rate-limited / repo not found -> stay quiet, retry next tick
        if (!latest) return;
        if (!force && readUpdateState().sha === latest) return; // already up to date

        log("[Update] new version " + latest.slice(0, 7) + " on " + cfg.owner + "/" + cfg.repo + " - downloading");
        const buf = await ghFetch(`https://codeload.github.com/${cfg.owner}/${cfg.repo}/zip/${latest}`, cfg.token, true);
        fs.writeFileSync(tmpZip, buf);
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { }
        fs.mkdirSync(tmpDir, { recursive: true });
        extractZip(tmpZip, tmpDir);
        const top = fs.readdirSync(tmpDir).map(n => path.join(tmpDir, n)).find(p => { try { return fs.statSync(p).isDirectory(); } catch { return false; } });
        if (!top) throw new Error("archive had no folder");

        // refresh only repo-managed parts; config.json, logs, data\*.json and the user's own themes stay put
        copyDirInto(path.join(top, "plugins"), pluginsDir);
        copyDirInto(path.join(top, "assets"), path.join(beecordDir, "assets"));
        copyDirInto(path.join(top, "themes"), path.join(beecordDir, "themes"), [".css"]);
        const codeChanges = copyDirInto(path.join(top, "data"), dataDir);
        const codeChanged = codeChanges.some(p => /[\\/](loader|renderer|media|install)\.(js|ps1)$/i.test(p));
        writeUpdateState({ sha: latest, at: Date.now() });
        log("[Update] updated to " + latest.slice(0, 7) + (codeChanged ? " (core changed)" : " (plugins/assets live)"));

        if (codeChanged) {
            checkDiscordPatch();
            if (cfg.restartOnCodeChange !== false && isDiscordRunning()) { log("[Update] restarting Discord to apply core changes"); restartDiscord(); }
        }
        // plugin-only changes apply live: the loader watches the plugins folder and reloads them.
    } catch (e) {
        log("[Update] error: " + (e && e.message || e));
    } finally {
        try { fs.rmSync(tmpZip, { force: true }); } catch { }
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { }
        isSyncing = false;
    }
}

// Safety net against restart loops: if we have to re-patch more than 3 times in 5 minutes,
// something else (another mod's watcher) keeps rewriting index.js. Stop restarting Discord then.
const patchTimes = [];
let loopWarned = false;
function tickDiscord() {
    try {
        let current = "";
        try { const f = findCoreFiles()[0]; if (f) current = fs.readFileSync(f, "utf8"); } catch { }
        if (current && !current.startsWith(MARKER) && LEGACY_MARKERS.some(m => current.startsWith(m))) {
            log("UWAGA: index.js zostal nadpisany przez inny mod (" + current.slice(0, 14) + "). Zatrzymaj jego watcher/autostart.");
        }
        if (checkDiscordPatch()) {
            const now = Date.now();
            patchTimes.push(now);
            while (patchTimes.length && now - patchTimes[0] > 5 * 60 * 1000) patchTimes.shift();
            if (patchTimes.length > 3) {
                if (!loopWarned) { loopWarned = true; log("Wykryto petle patchowania (inny watcher?). Restart Discorda wstrzymany - patch zadziala po recznym restarcie."); }
                return;
            }
            loopWarned = false;
            if (isDiscordRunning()) restartDiscord();
        }
    } catch (e) { log("tickDiscord error: " + e.message); }
}

function isNodeProcess(pid) {
    try {
        return new RegExp("node(\\.exe)?", "i").test(execFileSync("tasklist", ["/fi", "PID eq " + pid, "/fo", "csv", "/nh"], { encoding: "utf8", windowsHide: true }));
    } catch { return false; }
}

if (process.argv[2] === "--once") {
    tickDiscord();
    syncFromRepo(process.argv[3] === "--force");
} else {
    try {
        const old = parseInt(fs.readFileSync(pidFile, "utf8"), 10);
        if (old && old !== process.pid && isNodeProcess(old)) process.exit(0);
    } catch { }
    try { fs.mkdirSync(logsDir, { recursive: true }); fs.writeFileSync(pidFile, String(process.pid)); } catch { }
    const cfg0 = readUpdateConfig();
    const configured = !!(cfg0 && cfg0.enabled !== false && cfg0.owner && !/YOUR_GITHUB/i.test(String(cfg0.owner)));
    log("watcher started (auto-update " + (configured ? "ON -> " + cfg0.owner + "/" + cfg0.repo : "not configured (set data\\update.json)") + ")");

    tickDiscord();
    setInterval(tickDiscord, DISCORD_CHECK_INTERVAL);

    syncFromRepo(false);
    const mins = Math.max(2, Number(cfg0 && cfg0.intervalMinutes) || 5);
    setInterval(() => syncFromRepo(false), mins * 60 * 1000);
}
