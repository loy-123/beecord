# beecord

A plugin & theme mod for the **Discord desktop app** on Windows. It adds a `beecord` section to Discord's
settings with plugins (privacy, chat, tools, look) and custom CSS themes, in a dark imgui-style UI.

It also **auto-updates from this repository**: once it's installed, each machine checks this repo in the
background and pulls changes. You edit here, push, and everyone gets the update — no reinstall.

> **Heads-up:** beecord modifies Discord's files. This is against Discord's Terms of Service and can get an
> account banned. Use it on an account you're willing to risk. Windows only.

---

## Requirements
- **Windows 10/11**
- **[Node.js](https://nodejs.org)** (LTS) — the installer and updater run on Node.
- **Discord** installed and opened at least once.

## Install
Any one of these (all do the same thing):
- Double-click **`beecord-installer.exe`** (themed window), **or**
- Double-click **`beecord-installer.bat`**, **or**
- In this folder, run: `node data/install.js`

Then open **Discord → Settings → beecord**.

To **uninstall**: run the installer and click *Uninstall*, or `node data/install.js uninstall` (restores Discord).

---

## Auto-update (how to make updates reach everyone)
1. Open **`data/update.json`** and set it to your repo:
   ```json
   { "enabled": true, "owner": "YOUR_GITHUB_USERNAME", "repo": "beecord", "branch": "main", "intervalMinutes": 5, "restartOnCodeChange": true, "token": "" }
   ```
2. Commit & push. Anyone who has installed beecord will auto-update within a few minutes (or on next launch).

**How it works:** a background watcher (started at login) checks this repo's latest commit. On a change it
downloads the repo zip, and refreshes `plugins/`, `data/`, `assets/` and bundled `themes/*.css` in
`%APPDATA%\beecord`. **No git is needed on the client.**
- **Plugin changes apply live** (no restart).
- **Core changes** (`data/loader.js`, `data/renderer.js`) re-patch and restart Discord automatically.
- A user's **settings, logs and personal themes are never overwritten.**

> The repo must be **public** (clients fetch it anonymously). For a private repo, put a GitHub token with
> `repo` scope in `token` — but then everyone you share with can read that token, so a public repo is best.

---

## Developing
- **Plugins** live in `plugins/*.js`. Edit one and it hot-reloads in Discord instantly. Start from `plugins/_template.js`.
- **Core** is `data/loader.js` (Electron main) + `data/renderer.js` (the page / UI). Changes need a Discord restart.
- **Themes** are `themes/*.css` (BetterDiscord `*.theme.css` works too). The default is `Celestial ImGui.theme.css`.
- The GUI installer is `installer/beecord-setup.ps1` (+ `beecord-installer.bat`). If you change the `.ps1` and
  want to ship the `.exe`, rebuild it (see that file's header) and commit the new exe.

Not affiliated with or endorsed by Discord.
