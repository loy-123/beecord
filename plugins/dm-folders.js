// DM Folders v1.1.1 for Beecord
// Organize Direct Messages (DMs) into collapsible, colored, custom-named folders via Drag & Drop.
// Fixes in v1.1.1:
// 1. Exact native Discord font (var(--font-primary), 16px, 500 weight, native colors).
// 2. Full folder reordering: drag folder headers up/down to sort folders in any custom order!
// 3. User status indicators (online, idle, dnd, offline, mobile) rendered on every avatar.
// 4. Stable container architecture: never jumps above Friends, zero disappearing DMs.
// Author: blxstn (2026)

(window.beecord || window.blxstncord).definePlugin({
    id: "dm-folders",
    name: "DM Folders",
    description: "Create and manage folders in your Direct Messages sidebar with drag & drop, custom names, colors, and reordering.",
    author: "blxstn",
    version: "1.1.1",
    enabledByDefault: true,
    webpack: false,

    start(api) {
        let running = true;
        let reconcileTimer = null;
        let mutationObserver = null;
        let justDragged = false;
        let cachedChannels = {};
        let cachedStatus = {}; // channelId -> { status, activities, isMobile }

        // ---------- Preset Color Palette ----------
        const PRESET_COLORS = [
            { name: "Bee Gold", hex: "#f0b232" },
            { name: "Blurple", hex: "#5865f2" },
            { name: "Emerald", hex: "#23a559" },
            { name: "Coral Red", hex: "#f23f42" },
            { name: "Fuchsia", hex: "#eb459e" },
            { name: "Cyan Sky", hex: "#00a8fc" },
            { name: "Royal Purple", hex: "#9b59b6" },
            { name: "Sunset Orange", hex: "#e67e22" },
            { name: "Obsidian Dark", hex: "#4e5058" },
            { name: "Pure White", hex: "#f2f3f5" }
        ];

        // ==================== Multi-Layer Redundant Storage ====================
        // Layer 1: Injected disk file from loader (__beecordDiskFolders)
        // Layer 2: Real-time IPC console command (cmd:save-folders -> folders.json on disk)
        // Layer 3: api.settings (Discord config)
        // Layer 4: localStorage ("beecord_dm_folders")
        // Layer 5: IndexedDB ("beecord_dm_folders_db")
        const IDB_NAME = "beecord_dm_folders_db";
        function saveToIDB(data) {
            try {
                const req = indexedDB.open(IDB_NAME, 1);
                req.onupgradeneeded = () => req.result.createObjectStore("store");
                req.onsuccess = () => {
                    try {
                        const db = req.result;
                        const tx = db.transaction("store", "readwrite");
                        tx.objectStore("store").put(data, "folders");
                        tx.oncomplete = () => db.close();
                    } catch { }
                };
            } catch { }
        }

        function loadFromIDB(callback) {
            try {
                const req = indexedDB.open(IDB_NAME, 1);
                req.onupgradeneeded = () => req.result.createObjectStore("store");
                req.onsuccess = () => {
                    try {
                        const db = req.result;
                        const tx = db.transaction("store", "readonly");
                        const getReq = tx.objectStore("store").get("folders");
                        getReq.onsuccess = () => {
                            db.close();
                            if (getReq.result && Array.isArray(getReq.result) && getReq.result.length > 0) {
                                callback(getReq.result);
                            }
                        };
                    } catch { }
                };
            } catch { }
        }

        function sanitizeFolders(raw) {
            if (!raw || !Array.isArray(raw)) return [];
            return raw.map(f => ({
                id: String(f.id || "dmf_" + Math.random().toString(36).slice(2, 9)),
                name: String(f.name || "Folder"),
                color: String(f.color || "#f0b232"),
                collapsed: !!f.collapsed,
                channelIds: Array.isArray(f.channelIds) ? f.channelIds.map(String) : []
            })).filter(f => f.channelIds.length > 0);
        }

        function loadState() {
            try {
                // 1. Check window.__beecordDiskFolders (injected from loader.js on disk)
                if (window.__beecordDiskFolders && Array.isArray(window.__beecordDiskFolders) && window.__beecordDiskFolders.length > 0) {
                    return { folders: sanitizeFolders(window.__beecordDiskFolders) };
                }
                // 2. Check api.settings
                const settingVal = api.settings.get("folders", null);
                if (settingVal && Array.isArray(settingVal) && settingVal.length > 0) {
                    return { folders: sanitizeFolders(settingVal) };
                }
                // 3. Check localStorage
                try {
                    const lsVal = JSON.parse(localStorage.getItem("beecord_dm_folders") || "null");
                    if (lsVal && Array.isArray(lsVal) && lsVal.length > 0) {
                        return { folders: sanitizeFolders(lsVal) };
                    }
                } catch { }
            } catch (err) {
                api.log("loadState error:", err && err.message ? err.message : String(err));
            }
            return { folders: [] };
        }

        let state = loadState();

        // Async check from IndexedDB fallback if initial sync state was empty
        if (state.folders.length === 0) {
            loadFromIDB(folders => {
                if (state.folders.length === 0 && folders && folders.length > 0) {
                    state.folders = sanitizeFolders(folders);
                    saveState();
                    reconcileFolders();
                }
            });
        }

        function saveState() {
            try {
                state.folders = (state.folders || []).filter(f => f.channelIds && f.channelIds.length > 0);
                const cleanFolders = sanitizeFolders(state.folders);

                // 1. In-memory window cache
                window.__beecordDiskFolders = cleanFolders;

                // 2. api.settings
                api.settings.set("folders", cleanFolders);

                // 3. localStorage
                try { localStorage.setItem("beecord_dm_folders", JSON.stringify(cleanFolders)); } catch { }

                // 4. IndexedDB permanent leveldb storage
                saveToIDB(cleanFolders);

                // 5. Direct disk write via loader
                try { console.log("[beecord] cmd:save-folders:" + JSON.stringify(cleanFolders)); } catch { }
            } catch (e) {
                api.log("Failed to save state:", e && e.message ? e.message : String(e));
            }
            updateDynamicHidingStyles();
        }

        function findFolderOfChannel(channelId) {
            return (state.folders || []).find(f => (f.channelIds || []).includes(String(channelId))) || null;
        }

        function findFolderById(folderId) {
            return (state.folders || []).find(f => f.id === String(folderId)) || null;
        }

        // ---------- SVG Icons ----------
        const ICONS = {
            folder: (color) => `
                <svg viewBox="0 0 24 24" class="bdf-icon-svg" style="fill: ${color}; filter: drop-shadow(0 0 5px ${color}44);">
                    <path d="M20 6h-8l-2-2H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 12H4V8h16v10z"/>
                </svg>`,
            chevron: `
                <svg viewBox="0 0 24 24">
                    <path fill="currentColor" d="M9.29 15.88L13.17 12 9.29 8.12a.996.996 0 1 1 1.41-1.41l4.59 4.59c.39.39.39 1.02 0 1.41L10.7 17.3a.996.996 0 0 1-1.41 0c-.38-.39-.39-1.03 0-1.42z"/>
                </svg>`,
            settings: `
                <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                    <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.488.488 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
                </svg>`,
            trash: `
                <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                    <path d="M15 4V3H9v1H4v2h1v13c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V6h1V4h-5zm2 15H7V6h10v13zM9 8h2v9H9zm4 0h2v9h-2z"/>
                </svg>`,
            close: `
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                    <path d="M18.4 4L12 10.4L5.6 4L4 5.6L10.4 12L4 18.4L5.6 20L12 13.6L18.4 20L20 18.4L13.6 12L20 5.6L18.4 4Z"/>
                </svg>`
        };

        // ---------- CSS Styles ----------
        api.addStyle(`
            /* Root Folders Wrapper */
            .bdf-folders-root {
                display: flex;
                flex-direction: column;
                margin: 0;
                padding: 0;
                width: 100%;
                box-sizing: border-box;
            }

            /* Folder Block */
            .bdf-folder-block {
                display: flex;
                flex-direction: column;
                margin-bottom: 2px;
                position: relative;
            }

            /* Folder Header */
            .bdf-folder-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                height: 36px;
                padding: 0 10px;
                margin: 3px 8px 1px 8px;
                border-radius: 8px;
                cursor: grab;
                user-select: none;
                transition: background 0.15s ease, border-color 0.15s ease, transform 0.1s ease;
                position: relative;
                box-sizing: border-box;
                background: rgba(255, 255, 255, 0.035);
                border: 1px solid rgba(255, 255, 255, 0.04);
            }
            .bdf-folder-header:active {
                cursor: grabbing;
                transform: scale(0.99);
            }
            .bdf-folder-header:hover {
                background: rgba(255, 255, 255, 0.07);
                border-color: rgba(255, 255, 255, 0.08);
            }
            .bdf-folder-header.bdf-drop-hover {
                background: rgba(240, 178, 50, 0.18) !important;
                border: 1px dashed #f0b232 !important;
                box-shadow: 0 0 12px rgba(240, 178, 50, 0.35);
            }

            .bdf-left {
                display: flex;
                align-items: center;
                gap: 8px;
                min-width: 0;
                flex: 1;
            }
            .bdf-chevron {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                width: 16px;
                height: 16px;
                color: #949ba4;
                transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1), color 0.15s ease;
                flex-shrink: 0;
            }
            .bdf-chevron svg {
                width: 14px;
                height: 14px;
                fill: currentColor;
            }
            .bdf-folder-header.bdf-collapsed .bdf-chevron {
                transform: rotate(-90deg);
            }
            .bdf-folder-header:hover .bdf-chevron {
                color: #dbdee1;
            }
            .bdf-icon-wrap {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                width: 18px;
                height: 18px;
                flex-shrink: 0;
            }
            .bdf-icon-svg {
                width: 16px;
                height: 16px;
            }
            .bdf-name {
                font-family: var(--font-primary), "gg sans", "Noto Sans", sans-serif !important;
                font-size: 13px !important;
                font-weight: 700 !important;
                color: #dbdee1;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
                letter-spacing: 0.2px;
            }
            .bdf-badge {
                font-size: 10px;
                font-weight: 700;
                background: rgba(0, 0, 0, 0.35);
                color: #949ba4;
                padding: 1px 6px;
                border-radius: 10px;
                flex-shrink: 0;
                margin-left: 2px;
                border: 1px solid rgba(255, 255, 255, 0.05);
            }
            .bdf-unread-dot {
                width: 8px;
                height: 8px;
                border-radius: 50%;
                background: #f23f42;
                box-shadow: 0 0 6px rgba(242, 63, 66, 0.7);
                flex-shrink: 0;
                margin-left: auto;
                margin-right: 4px;
                animation: bdfPulse 1.8s infinite ease-in-out;
            }
            @keyframes bdfPulse {
                0%, 100% { transform: scale(1); opacity: 1; }
                50% { transform: scale(1.25); opacity: 0.75; }
            }

            .bdf-actions {
                display: flex;
                align-items: center;
                gap: 4px;
                opacity: 0;
                transition: opacity 0.15s ease;
                flex-shrink: 0;
            }
            .bdf-folder-header:hover .bdf-actions {
                opacity: 1;
            }
            .bdf-btn-action {
                background: transparent;
                border: none;
                color: #949ba4;
                cursor: pointer;
                padding: 4px;
                border-radius: 4px;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                transition: color 0.12s ease, background 0.12s ease;
            }
            .bdf-btn-action:hover {
                color: #ffffff;
                background: rgba(255, 255, 255, 0.1);
            }
            .bdf-btn-action.bdf-action-ungroup:hover {
                color: #f23f42;
                background: rgba(242, 63, 66, 0.15);
            }

            /* Folder Items Container */
            .bdf-folder-items {
                display: flex;
                flex-direction: column;
                margin: 0;
                padding: 1px 0 3px 0;
                box-sizing: border-box;
            }
            .bdf-folder-header.bdf-collapsed + .bdf-folder-items {
                display: none;
            }

            /* Exact Native Discord DM Item Styling */
            .bdf-dm-item {
                display: flex;
                align-items: center;
                height: 44px;
                padding: 0 8px;
                margin: 1px 8px;
                border-radius: 4px;
                cursor: pointer;
                user-select: none;
                position: relative;
                box-sizing: border-box;
                background: rgba(255, 255, 255, 0.02);
                transition: background 0.12s ease;
                text-decoration: none;
                color: inherit;
            }
            .bdf-dm-item:hover {
                background: rgba(255, 255, 255, 0.055);
            }
            .bdf-dm-item.bdf-selected {
                background: rgba(255, 255, 255, 0.1);
            }

            /* Delicate vertical color pill on left */
            .bdf-dm-item::before {
                content: "";
                position: absolute;
                left: 3px;
                top: 8px;
                bottom: 8px;
                width: 3px;
                border-radius: 2px;
                background: var(--bdf-item-color, #f0b232);
                box-shadow: 0 0 6px var(--bdf-item-glow, rgba(240, 178, 50, 0.35));
                pointer-events: none;
                z-index: 2;
            }

            /* Avatar & Status Indicator */
            .bdf-dm-avatar-wrap {
                width: 32px;
                height: 32px;
                position: relative;
                flex-shrink: 0;
                margin-right: 12px;
                margin-left: 4px;
            }
            .bdf-dm-avatar {
                width: 32px;
                height: 32px;
                border-radius: 50%;
                object-fit: cover;
                background: #2b2d31;
                display: block;
            }
            .bdf-dm-status-dot {
                position: absolute;
                right: -2px;
                bottom: -2px;
                width: 10px;
                height: 10px;
                border-radius: 50%;
                border: 2px solid #1e1f22;
                box-sizing: content-box;
                display: flex;
                align-items: center;
                justify-content: center;
                pointer-events: none;
            }
            .bdf-status-online { background: #23a55a; }
            .bdf-status-idle { background: #f0b232; }
            .bdf-status-dnd { background: #f23f43; }
            .bdf-status-offline { background: #80848e; }

            .bdf-dnd-minus {
                width: 6px;
                height: 2px;
                background: #1e1f22;
                border-radius: 1px;
            }
            .bdf-idle-moon {
                width: 4px;
                height: 4px;
                border-radius: 50%;
                box-shadow: 2px -1px 0 0 #1e1f22;
                transform: translate(-1px, 1px);
            }

            .bdf-dm-text-wrap {
                display: flex;
                align-items: center;
                min-width: 0;
                flex: 1;
                overflow: hidden;
            }
            /* Exact 100% Native Discord Font */
            .bdf-dm-name {
                font-family: var(--font-primary), "gg sans", "Noto Sans", sans-serif !important;
                font-size: 16px !important;
                font-weight: 500 !important;
                line-height: 20px !important;
                letter-spacing: normal !important;
                color: var(--channels-default, #949ba4) !important;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            .bdf-dm-item:hover .bdf-dm-name {
                color: var(--interactive-hover, #dbdee1) !important;
            }
            .bdf-dm-item.bdf-selected .bdf-dm-name {
                color: var(--interactive-active, #ffffff) !important;
                font-weight: 600 !important;
            }

            .bdf-clan-tag {
                display: inline-flex;
                align-items: center;
                margin-left: 6px;
                padding: 1px 4px;
                border-radius: 4px;
                background: rgba(255, 255, 255, 0.08);
                color: #b5bac1;
                font-size: 10px;
                font-weight: 700;
                font-family: var(--font-primary), "gg sans", sans-serif;
                letter-spacing: 0.2px;
                flex-shrink: 0;
            }

            /* Drag & Drop Visuals */
            .bdf-drag-ghost {
                position: fixed;
                pointer-events: none;
                z-index: 99999;
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 6px 12px;
                background: rgba(18, 19, 22, 0.94);
                border: 1px solid rgba(240, 178, 50, 0.6);
                border-radius: 8px;
                box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6), 0 0 12px rgba(240, 178, 50, 0.35);
                color: #ffffff;
                font-size: 14px;
                font-family: var(--font-primary), "gg sans", sans-serif;
                font-weight: 600;
                transform: translate(14px, 14px);
                backdrop-filter: blur(8px);
            }
            .bdf-drag-ghost img {
                width: 24px;
                height: 24px;
                border-radius: 50%;
                object-fit: cover;
            }
            .bdf-drag-ghost svg {
                width: 20px;
                height: 20px;
            }
            .bdf-drop-combine {
                position: relative;
                background: rgba(240, 178, 50, 0.15) !important;
                border-radius: 6px;
                box-shadow: inset 0 0 0 2px #f0b232, 0 0 12px rgba(240, 178, 50, 0.35) !important;
            }
            .bdf-drop-combine::after {
                content: attr(data-bdf-drop-label);
                position: absolute;
                right: 8px;
                top: 50%;
                transform: translateY(-50%);
                font-size: 11px;
                font-weight: 700;
                color: #f0b232;
                background: rgba(0, 0, 0, 0.6);
                padding: 2px 6px;
                border-radius: 4px;
                pointer-events: none;
            }
            .bdf-insert-indicator {
                position: absolute;
                left: 8px;
                right: 8px;
                height: 2px;
                background: #f0b232;
                box-shadow: 0 0 8px #f0b232;
                border-radius: 2px;
                pointer-events: none;
                z-index: 100;
            }

            /* Customization Modal */
            .bdf-modal-backdrop {
                position: fixed;
                top: 0; left: 0; right: 0; bottom: 0;
                background: rgba(0, 0, 0, 0.7);
                backdrop-filter: blur(4px);
                z-index: 10000;
                display: flex;
                align-items: center;
                justify-content: center;
                animation: bdfFadeIn 0.15s ease;
            }
            @keyframes bdfFadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
            }
            .bdf-modal {
                width: 440px;
                max-width: 90vw;
                background: #2b2d31;
                border-radius: 12px;
                box-shadow: 0 16px 40px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.08);
                display: flex;
                flex-direction: column;
                overflow: hidden;
                animation: bdfPop 0.15s cubic-bezier(0.34, 1.56, 0.64, 1);
            }
            @keyframes bdfPop {
                from { transform: scale(0.92); opacity: 0; }
                to { transform: scale(1); opacity: 1; }
            }
            .bdf-modal-header {
                padding: 18px 20px 14px 20px;
                display: flex;
                align-items: center;
                justify-content: space-between;
                border-bottom: 1px solid rgba(255, 255, 255, 0.06);
            }
            .bdf-modal-title {
                font-size: 17px;
                font-weight: 700;
                color: #f2f3f5;
                display: flex;
                align-items: center;
                gap: 8px;
                font-family: var(--font-primary), "gg sans", sans-serif;
            }
            .bdf-modal-title svg {
                width: 20px;
                height: 20px;
            }
            .bdf-btn-close {
                background: transparent;
                border: none;
                color: #949ba4;
                cursor: pointer;
                padding: 4px;
                border-radius: 6px;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: color 0.12s, background 0.12s;
            }
            .bdf-btn-close:hover {
                color: #ffffff;
                background: rgba(255, 255, 255, 0.08);
            }
            .bdf-modal-body {
                padding: 20px;
                display: flex;
                flex-direction: column;
                gap: 16px;
            }
            .bdf-field {
                display: flex;
                flex-direction: column;
                gap: 8px;
            }
            .bdf-label {
                font-size: 12px;
                font-weight: 700;
                color: #b5bac1;
                text-transform: uppercase;
                letter-spacing: 0.4px;
                font-family: var(--font-primary), "gg sans", sans-serif;
            }
            .bdf-input-name {
                background: #1e1f22;
                border: 1px solid rgba(255, 255, 255, 0.08);
                border-radius: 6px;
                padding: 10px 12px;
                font-size: 14px;
                color: #f2f3f5;
                font-family: var(--font-primary), "gg sans", sans-serif;
                outline: none;
                transition: border-color 0.15s ease, box-shadow 0.15s ease;
            }
            .bdf-input-name:focus {
                border-color: #5865f2;
                box-shadow: 0 0 0 2px rgba(88, 101, 242, 0.25);
            }
            .bdf-color-grid {
                display: grid;
                grid-template-columns: repeat(5, 1fr);
                gap: 10px;
            }
            .bdf-color-swatch {
                height: 38px;
                border-radius: 8px;
                border: 2px solid transparent;
                cursor: pointer;
                position: relative;
                transition: transform 0.12s ease, border-color 0.12s ease, box-shadow 0.12s ease;
            }
            .bdf-color-swatch:hover {
                transform: scale(1.06);
            }
            .bdf-color-swatch.bdf-selected {
                border-color: #ffffff;
                transform: scale(1.08);
                box-shadow: 0 0 10px rgba(255, 255, 255, 0.4);
            }
            .bdf-custom-color-row {
                display: flex;
                align-items: center;
                gap: 10px;
                margin-top: 4px;
                background: #1e1f22;
                padding: 8px 12px;
                border-radius: 6px;
                border: 1px solid rgba(255, 255, 255, 0.05);
            }
            .bdf-color-picker-input {
                width: 32px;
                height: 32px;
                border: none;
                border-radius: 6px;
                cursor: pointer;
                background: transparent;
                padding: 0;
            }
            .bdf-hex-display {
                font-family: monospace;
                font-size: 13px;
                font-weight: 700;
                color: #dbdee1;
            }
            .bdf-modal-footer {
                padding: 14px 20px 18px 20px;
                display: flex;
                align-items: center;
                justify-content: space-between;
                background: #232428;
                border-top: 1px solid rgba(255, 255, 255, 0.04);
            }
            .bdf-btn {
                padding: 8px 18px;
                border-radius: 6px;
                font-size: 14px;
                font-weight: 600;
                cursor: pointer;
                border: none;
                font-family: var(--font-primary), "gg sans", sans-serif;
                transition: background 0.12s ease, transform 0.1s ease;
            }
            .bdf-btn:active {
                transform: scale(0.97);
            }
            .bdf-btn-cancel {
                background: transparent;
                color: #ffffff;
            }
            .bdf-btn-cancel:hover {
                text-decoration: underline;
            }
            .bdf-btn-ungroup {
                background: rgba(242, 63, 66, 0.15);
                color: #f23f42;
                border: 1px solid rgba(242, 63, 66, 0.3);
            }
            .bdf-btn-ungroup:hover {
                background: #f23f42;
                color: #ffffff;
            }
            .bdf-btn-save {
                background: #5865f2;
                color: #ffffff;
            }
            .bdf-btn-save:hover {
                background: #4752c4;
            }
        `);

        // ---------- Dynamic CSS to hide member channels from Discord's unfiled virtual scroller ----------
        let dynamicHidingStyleEl = null;
        function updateDynamicHidingStyles() {
            if (!dynamicHidingStyleEl) {
                dynamicHidingStyleEl = document.createElement("style");
                dynamicHidingStyleEl.id = "bdf-dynamic-hiding-styles";
                (document.head || document.documentElement).appendChild(dynamicHidingStyleEl);
            }

            const allMemberIds = [];
            (state.folders || []).forEach(f => {
                (f.channelIds || []).forEach(id => {
                    if (id) allMemberIds.push(String(id));
                });
            });

            if (allMemberIds.length === 0) {
                dynamicHidingStyleEl.textContent = "";
                return;
            }

            const selectors = allMemberIds.map(id => `ul[class*="content_"] > li:has(a[href*="/channels/@me/${id}"])`).join(",\n");
            dynamicHidingStyleEl.textContent = selectors ? `${selectors} {\n    display: none !important;\n}` : "";
        }
        updateDynamicHidingStyles();

        // ---------- Extract Channels & Live Status from React Fiber ----------
        function extractChannelsFromFiber(ul) {
            try {
                if (!ul) return;
                const key = Object.keys(ul).find(k => k.startsWith("__reactFiber$") || k.startsWith("__reactInternalInstance$"));
                let cur = key ? ul[key] : null;
                while (cur) {
                    if (cur.memoizedProps && cur.memoizedProps.channels) {
                        const chs = cur.memoizedProps.channels;
                        Object.keys(chs).forEach(id => {
                            cachedChannels[id] = chs[id];
                        });
                        break;
                    }
                    cur = cur.return;
                }

                // Scan live rendered DM items in the DOM to capture real-time online/idle/dnd statuses!
                const renderedLis = ul.querySelectorAll('li:has(a[href*="/channels/@me/"])');
                for (const li of renderedLis) {
                    const a = li.querySelector('a[href*="/channels/@me/"]');
                    const chId = getChannelIdFromHref(a ? a.getAttribute("href") : null);
                    if (!chId) continue;

                    const lKey = Object.keys(li).find(k => k.startsWith("__reactFiber$"));
                    let lCur = lKey ? li[lKey] : null;
                    while (lCur) {
                        if (lCur.memoizedProps && lCur.memoizedProps.status) {
                            cachedStatus[chId] = {
                                status: String(lCur.memoizedProps.status).toLowerCase(),
                                isMobile: !!lCur.memoizedProps.isMobile
                            };
                            break;
                        }
                        lCur = lCur.return;
                    }
                }
            } catch { }
        }

        function getChannelInfo(channelId) {
            channelId = String(channelId);
            const ch = cachedChannels[channelId];
            const statusInfo = cachedStatus[channelId] || { status: "offline", isMobile: false };

            if (ch) {
                const recipient = (ch.rawRecipients && ch.rawRecipients[0]) || {};
                const name = ch.name || recipient.globalName || recipient.username || "Direct Message";
                const avatar = recipient.avatar
                    ? `https://cdn.discordapp.com/avatars/${recipient.id}/${recipient.avatar}.webp?size=64`
                    : "https://cdn.discordapp.com/embed/avatars/0.png";
                const clan = recipient.clan || recipient.primary_guild || null;
                return { id: channelId, name, avatar, status: statusInfo.status, isMobile: statusInfo.isMobile, clan };
            }

            // Fallback from DOM if previously rendered
            const a = document.querySelector(`a[href*="/channels/@me/${channelId}"]`);
            if (a) {
                const nameEl = a.querySelector('[class*="name_"], [class*="channelName_"], [class*="username_"]');
                const img = a.querySelector('img[class*="avatar_"], img');
                const name = (nameEl ? nameEl.innerText || nameEl.textContent : "").trim() || "Direct Message";
                const avatar = img ? img.src : "https://cdn.discordapp.com/embed/avatars/0.png";
                return { id: channelId, name, avatar, status: statusInfo.status, isMobile: statusInfo.isMobile, clan: null };
            }

            return { id: channelId, name: "Direct Message", avatar: "https://cdn.discordapp.com/embed/avatars/0.png", status: "offline", isMobile: false, clan: null };
        }

        // ---------- Customization Modal Dialog ----------
        function showFolderModal(folder, isNew = false) {
            const backdrop = document.createElement("div");
            backdrop.className = "bdf-modal-backdrop";

            let curColor = folder.color || "#f0b232";

            backdrop.innerHTML = `
                <div class="bdf-modal">
                    <div class="bdf-modal-header">
                        <div class="bdf-modal-title">
                            ${ICONS.folder(curColor)}
                            <span>${isNew ? "Utwórz folder DM" : "Edytuj folder DM"}</span>
                        </div>
                        <button type="button" class="bdf-btn-close">${ICONS.close}</button>
                    </div>
                    <div class="bdf-modal-body">
                        <div class="bdf-field">
                            <label class="bdf-label">Nazwa folderu</label>
                            <input type="text" class="bdf-input-name" placeholder="np. Przyjaciele, Praca, Gry..." value="${(folder.name || "Folder").replace(/"/g, '&quot;')}" maxlength="32">
                        </div>
                        <div class="bdf-field">
                            <label class="bdf-label">Kolor folderu</label>
                            <div class="bdf-color-grid"></div>
                            <div class="bdf-custom-color-row">
                                <input type="color" class="bdf-color-picker-input" value="${curColor}">
                                <span class="bdf-hex-display">${curColor.toUpperCase()}</span>
                            </div>
                        </div>
                    </div>
                    <div class="bdf-modal-footer">
                        ${!isNew ? `<button type="button" class="bdf-btn bdf-btn-ungroup">Rozgrupuj</button>` : `<div></div>`}
                        <div style="display: flex; gap: 8px;">
                            <button type="button" class="bdf-btn bdf-btn-cancel">Anuluj</button>
                            <button type="button" class="bdf-btn bdf-btn-save">Zapisz</button>
                        </div>
                    </div>
                </div>
            `;

            document.body.appendChild(backdrop);

            const modal = backdrop.querySelector(".bdf-modal");
            const inputName = modal.querySelector(".bdf-input-name");
            const grid = modal.querySelector(".bdf-color-grid");
            const colorPicker = modal.querySelector(".bdf-color-picker-input");
            const hexDisplay = modal.querySelector(".bdf-hex-display");
            const titleIcon = modal.querySelector(".bdf-modal-title .bdf-icon-svg");

            function updateColor(hex) {
                curColor = hex;
                colorPicker.value = hex;
                hexDisplay.textContent = hex.toUpperCase();
                hexDisplay.style.color = hex;
                if (titleIcon) titleIcon.setAttribute("fill", hex);
                grid.querySelectorAll(".bdf-color-swatch").forEach(sw => {
                    sw.classList.toggle("bdf-selected", sw.getAttribute("data-hex").toLowerCase() === hex.toLowerCase());
                });
            }

            PRESET_COLORS.forEach(c => {
                const sw = document.createElement("button");
                sw.type = "button";
                sw.className = "bdf-color-swatch" + (c.hex.toLowerCase() === curColor.toLowerCase() ? " bdf-selected" : "");
                sw.style.background = c.hex;
                sw.setAttribute("data-hex", c.hex);
                sw.title = c.name;
                sw.addEventListener("click", () => updateColor(c.hex));
                grid.appendChild(sw);
            });

            colorPicker.addEventListener("input", (e) => updateColor(e.target.value));

            function close() {
                backdrop.style.opacity = "0";
                setTimeout(() => backdrop.remove(), 150);
            }

            modal.querySelector(".bdf-btn-close").addEventListener("click", close);
            modal.querySelector(".bdf-btn-cancel").addEventListener("click", close);
            backdrop.addEventListener("click", (e) => {
                if (e.target === backdrop) close();
            });

            const ungroupBtn = modal.querySelector(".bdf-btn-ungroup");
            if (ungroupBtn) {
                ungroupBtn.addEventListener("click", () => {
                    const idx = state.folders.findIndex(f => f.id === folder.id);
                    if (idx !== -1) {
                        state.folders.splice(idx, 1);
                        saveState();
                        reconcileFolders();
                    }
                    close();
                });
            }

            function handleSave() {
                const finalName = inputName.value.trim() || "Folder";
                folder.name = finalName;
                folder.color = curColor;
                saveState();
                reconcileFolders();
                close();
            }

            modal.querySelector(".bdf-btn-save").addEventListener("click", handleSave);
            inputName.addEventListener("keydown", (e) => {
                if (e.key === "Enter") handleSave();
                if (e.key === "Escape") close();
            });

            setTimeout(() => {
                inputName.focus();
                inputName.select();
            }, 50);
        }

        // ---------- DOM Helper: Find Sidebar & DMs ----------
        function getDMNav() {
            return document.querySelector('nav[class*="privateChannels_"], nav[aria-label*="Private Channels"], nav[aria-label*="Bezpośrednie"]');
        }

        function getDMListUl() {
            const nav = getDMNav();
            if (!nav) return null;
            return nav.querySelector('ul[class*="content_"]') || nav.querySelector('ul');
        }

        function getChannelIdFromHref(href) {
            if (!href) return null;
            const m = href.match(/\/channels\/@me\/(\d+)/);
            return m ? m[1] : null;
        }

        // ---------- Reconcile Folders (Anchored strictly to Direct Messages Header) ----------
        function reconcileFolders() {
            if (!running) return;

            const ul = getDMListUl();
            if (!ul) return;

            extractChannelsFromFiber(ul);

            // Locate the "Direct Messages" section header
            const headerAnchor = ul.querySelector('[class*="privateChannelsHeaderContainer"]') || ul.querySelector('h2');
            let rootContainer = ul.querySelector("#bdf-folders-container");

            // If headerAnchor is scrolled off screen, folders smoothly scroll off too
            if (!headerAnchor || !headerAnchor.isConnected) {
                if (rootContainer) rootContainer.remove();
                return;
            }

            // If no folders exist, check once more before giving up
            if (!state.folders || state.folders.length === 0) {
                const reloaded = loadState();
                if (reloaded.folders && reloaded.folders.length > 0) {
                    state = reloaded;
                    updateDynamicHidingStyles();
                } else {
                    if (rootContainer) rootContainer.remove();
                    attachDragListeners(ul);
                    return;
                }
            }

            // Ensure container exists
            if (!rootContainer) {
                rootContainer = document.createElement("div");
                rootContainer.id = "bdf-folders-container";
                rootContainer.className = "bdf-folders-root";
            }

            // Anchor strictly right after Direct Messages header:
            // This guarantees folders are NEVER at index 0 and NEVER above "Friends"!
            if (headerAnchor.nextSibling !== rootContainer) {
                ul.insertBefore(rootContainer, headerAnchor.nextSibling);
            }

            const currentPath = window.location.pathname || "";

            // Render/update folder blocks in the exact user-defined order
            rootContainer.innerHTML = "";

            for (const folder of state.folders) {
                if (!folder.channelIds || folder.channelIds.length === 0) continue;

                const block = document.createElement("div");
                block.className = "bdf-folder-block";
                block.setAttribute("data-folder-id", folder.id);

                // Header
                const header = document.createElement("div");
                header.className = "bdf-folder-header" + (folder.collapsed ? " bdf-collapsed" : "");
                header.setAttribute("data-folder-id", folder.id);
                header.style.setProperty("--bdf-folder-color", folder.color);

                // Unread check
                let hasUnread = false;
                for (const chId of folder.channelIds) {
                    const nativeA = ul.querySelector(`a[href*="/channels/@me/${chId}"]`);
                    if (nativeA) {
                        const li = nativeA.closest('li') || nativeA.parentElement;
                        if (li && li.querySelector('[class*="badge_"], [class*="numberBadge_"], [class*="unread_"]')) {
                            hasUnread = true;
                            break;
                        }
                    }
                }

                header.innerHTML = `
                    <div class="bdf-left">
                        <span class="bdf-chevron">${ICONS.chevron}</span>
                        <span class="bdf-icon-wrap">${ICONS.folder(folder.color)}</span>
                        <span class="bdf-name" title="${folder.name.replace(/"/g, '&quot;')}">${folder.name}</span>
                        <span class="bdf-badge">${folder.channelIds.length}</span>
                        ${hasUnread && folder.collapsed ? `<span class="bdf-unread-dot" title="Nowa wiadomość w folderze!"></span>` : ``}
                    </div>
                    <div class="bdf-actions">
                        <button type="button" class="bdf-btn-action bdf-action-edit" title="Edytuj folder (nazwa / kolor)">
                            ${ICONS.settings}
                        </button>
                        <button type="button" class="bdf-btn-action bdf-action-ungroup" title="Rozgrupuj folder">
                            ${ICONS.trash}
                        </button>
                    </div>
                `;

                header.addEventListener("click", (e) => {
                    if (justDragged) return;
                    if (e.target.closest(".bdf-actions")) return;
                    folder.collapsed = !folder.collapsed;
                    saveState();
                    reconcileFolders();
                });

                header.addEventListener("contextmenu", (e) => {
                    e.preventDefault();
                    showFolderModal(folder, false);
                });

                header.addEventListener("dblclick", (e) => {
                    e.preventDefault();
                    showFolderModal(folder, false);
                });

                const editBtn = header.querySelector(".bdf-action-edit");
                if (editBtn) {
                    editBtn.addEventListener("click", (e) => {
                        e.stopPropagation();
                        showFolderModal(folder, false);
                    });
                }
                const ungroupBtn = header.querySelector(".bdf-action-ungroup");
                if (ungroupBtn) {
                    ungroupBtn.addEventListener("click", (e) => {
                        e.stopPropagation();
                        const idx = state.folders.findIndex(f => f.id === folder.id);
                        if (idx !== -1) {
                            state.folders.splice(idx, 1);
                            saveState();
                            reconcileFolders();
                        }
                    });
                }

                block.appendChild(header);

                // Member items container
                const itemsContainer = document.createElement("div");
                itemsContainer.className = "bdf-folder-items";

                for (const chId of folder.channelIds) {
                    const info = getChannelInfo(chId);
                    const itemEl = document.createElement("div");
                    const isSelected = currentPath.includes(chId);

                    itemEl.className = "bdf-dm-item" + (isSelected ? " bdf-selected" : "");
                    itemEl.setAttribute("data-channel-id", chId);
                    itemEl.setAttribute("data-folder-id", folder.id);
                    itemEl.style.setProperty("--bdf-item-color", folder.color);
                    itemEl.style.setProperty("--bdf-item-glow", folder.color + "44");

                    // Status dot HTML
                    let statusInner = "";
                    if (info.status === "dnd") statusInner = '<span class="bdf-dnd-minus"></span>';
                    else if (info.status === "idle") statusInner = '<span class="bdf-idle-moon"></span>';

                    // Clan tag HTML
                    let clanHtml = "";
                    if (info.clan && info.clan.tag) {
                        clanHtml = `<span class="bdf-clan-tag">${info.clan.tag}</span>`;
                    }

                    itemEl.innerHTML = `
                        <div class="bdf-dm-avatar-wrap">
                            <img src="${info.avatar}" class="bdf-dm-avatar" loading="lazy" onerror="this.src='https://cdn.discordapp.com/embed/avatars/0.png'">
                            <span class="bdf-dm-status-dot bdf-status-${info.status || 'offline'}" title="${(info.status || 'offline').toUpperCase()}">
                                ${statusInner}
                            </span>
                        </div>
                        <div class="bdf-dm-text-wrap">
                            <span class="bdf-dm-name" title="${info.name.replace(/"/g, '&quot;')}">${info.name}</span>
                            ${clanHtml}
                        </div>
                    `;

                    // Click to navigate
                    itemEl.addEventListener("click", () => {
                        if (justDragged) return;
                        const nativeA = ul.querySelector(`a[href*="/channels/@me/${chId}"]`);
                        if (nativeA) {
                            nativeA.click();
                        } else {
                            history.pushState(null, "", `/channels/@me/${chId}`);
                            window.dispatchEvent(new PopStateEvent("popstate"));
                        }
                        setTimeout(() => reconcileFolders(), 80);
                    });

                    // Context menu forwarding
                    itemEl.addEventListener("contextmenu", (e) => {
                        const nativeA = ul.querySelector(`a[href*="/channels/@me/${chId}"]`);
                        if (nativeA) {
                            e.preventDefault();
                            nativeA.dispatchEvent(new MouseEvent("contextmenu", {
                                bubbles: true,
                                cancelable: true,
                                view: window,
                                clientX: e.clientX,
                                clientY: e.clientY
                            }));
                        }
                    });

                    itemsContainer.appendChild(itemEl);
                }

                block.appendChild(itemsContainer);
                rootContainer.appendChild(block);
            }

            attachDragListeners(ul);
        }

        function scheduleReconcile() {
            clearTimeout(reconcileTimer);
            reconcileTimer = setTimeout(() => reconcileFolders(), 150);
        }

        // ---------- Drag & Drop Interaction Engine ----------
        let dragState = null;
        let ghostEl = null;
        let insertLineEl = null;
        let currentDropTarget = null;
        let currentDropAction = null;

        function removeDropVisuals() {
            if (ghostEl) {
                ghostEl.remove();
                ghostEl = null;
            }
            if (insertLineEl) {
                insertLineEl.remove();
                insertLineEl = null;
            }
            document.querySelectorAll(".bdf-drop-combine").forEach(el => {
                el.classList.remove("bdf-drop-combine");
                el.removeAttribute("data-bdf-drop-label");
            });
            document.querySelectorAll(".bdf-folder-header.bdf-drop-hover").forEach(el => {
                el.classList.remove("bdf-drop-hover");
            });
            currentDropTarget = null;
            currentDropAction = null;
        }

        function getDMChannelIdFromElement(el) {
            if (!el) return null;
            if (el.getAttribute("data-channel-id")) return el.getAttribute("data-channel-id");
            const li = el.closest('li') || el.closest('.bdf-dm-item');
            if (!li) return null;
            if (li.getAttribute("data-channel-id")) return li.getAttribute("data-channel-id");
            const a = li.querySelector('a[href*="/channels/@me/"]');
            return getChannelIdFromHref(a ? a.getAttribute("href") : null);
        }

        function getDMTitle(li) {
            if (!li) return "Direct Message";
            const nameEl = li.querySelector('.bdf-dm-name, [class*="name_"], [class*="channelName_"], [class*="username_"]') || li.querySelector('a');
            return (nameEl ? nameEl.innerText || nameEl.textContent : "Direct Message").trim().split("\n")[0] || "Direct Message";
        }

        function attachDragListeners(ul) {
            if (!ul || ul.__bdf_drag_init) return;
            ul.__bdf_drag_init = true;

            // Scroll listener on scroller to reconcile when scrolled back to top
            const scroller = ul.closest('[class*="scroller_"]') || ul.parentElement;
            if (scroller && !scroller.__bdf_scroll_init) {
                scroller.__bdf_scroll_init = true;
                let scrollDebounce = null;
                scroller.addEventListener("scroll", () => {
                    clearTimeout(scrollDebounce);
                    scrollDebounce = setTimeout(() => {
                        reconcileFolders();
                    }, 100);
                }, { passive: true });
            }

            // Prevent native link dragging
            ul.addEventListener("dragstart", (e) => e.preventDefault());

            // Pointer mousedown to start drag (Supports BOTH DMs and Folder Headers!)
            ul.addEventListener("mousedown", (e) => {
                if (e.button !== 0) return; // Left click only
                if (e.target.closest("button") || e.target.closest(".bdf-actions")) return;

                // 1. Dragging a FOLDER HEADER to reorder folders
                const folderHeader = e.target.closest(".bdf-folder-header");
                if (folderHeader) {
                    const fId = folderHeader.getAttribute("data-folder-id");
                    const folder = findFolderById(fId);
                    if (folder) {
                        dragState = {
                            type: "folder",
                            folderId: fId,
                            folder: folder,
                            sourceEl: folderHeader,
                            startX: e.clientX,
                            startY: e.clientY,
                            isDragging: false
                        };
                        return;
                    }
                }

                // 2. Dragging a DM ITEM
                const itemLi = e.target.closest('li:has(a[href*="/channels/@me/"]), .bdf-dm-item');
                if (!itemLi) return;

                const channelId = getDMChannelIdFromElement(itemLi);
                if (!channelId) return;

                const channelInfo = getChannelInfo(channelId);
                const title = channelInfo.name || getDMTitle(itemLi);
                const avatar = channelInfo.avatar;

                dragState = {
                    type: "dm",
                    channelId: String(channelId),
                    title: title,
                    avatar: avatar,
                    sourceLi: itemLi,
                    startX: e.clientX,
                    startY: e.clientY,
                    isDragging: false
                };
            });

            document.addEventListener("mousemove", (e) => {
                if (!dragState) return;

                // Threshold to initiate drag
                if (!dragState.isDragging) {
                    const dist = Math.hypot(e.clientX - dragState.startX, e.clientY - dragState.startY);
                    if (dist > 5) {
                        dragState.isDragging = true;
                        justDragged = true;

                        ghostEl = document.createElement("div");
                        ghostEl.className = "bdf-drag-ghost";

                        if (dragState.type === "folder") {
                            ghostEl.innerHTML = `
                                ${ICONS.folder(dragState.folder.color)}
                                <span>${dragState.folder.name}</span>
                            `;
                        } else {
                            ghostEl.innerHTML = `
                                <img src="${dragState.avatar}" onerror="this.src='https://cdn.discordapp.com/embed/avatars/0.png'">
                                <span>${dragState.title}</span>
                            `;
                        }
                        document.body.appendChild(ghostEl);

                        insertLineEl = document.createElement("div");
                        insertLineEl.className = "bdf-insert-indicator";
                        insertLineEl.style.display = "none";
                        document.body.appendChild(insertLineEl);
                    } else {
                        return;
                    }
                }

                // Update ghost position
                if (ghostEl) {
                    ghostEl.style.left = e.clientX + "px";
                    ghostEl.style.top = e.clientY + "px";
                }

                // Hit testing
                const elementsUnder = document.elementsFromPoint(e.clientX, e.clientY);
                let hitTarget = null;
                let hitAction = null;

                // A. DRAGGING A FOLDER (Reordering folders)
                if (dragState.type === "folder") {
                    for (const el of elementsUnder) {
                        if (el === ghostEl || el === insertLineEl) continue;

                        const targetHeader = el.closest(".bdf-folder-header");
                        if (targetHeader && targetHeader.getAttribute("data-folder-id") !== dragState.folderId) {
                            hitTarget = targetHeader;
                            const rect = targetHeader.getBoundingClientRect();
                            hitAction = (e.clientY < rect.top + rect.height / 2) ? "REORDER_FOLDER_BEFORE" : "REORDER_FOLDER_AFTER";
                            break;
                        }
                    }
                }
                // B. DRAGGING A DM ITEM
                else if (dragState.type === "dm") {
                    for (const el of elementsUnder) {
                        if (el === ghostEl || el === insertLineEl) continue;

                        // Hover over a Folder Header -> Add to folder
                        const folderHeader = el.closest(".bdf-folder-header");
                        if (folderHeader) {
                            const fId = folderHeader.getAttribute("data-folder-id");
                            const folder = findFolderById(fId);
                            if (folder && !folder.channelIds.includes(dragState.channelId)) {
                                hitTarget = folderHeader;
                                hitAction = "ADD_TO_FOLDER";
                                break;
                            }
                        }

                        // Hover over another DM item
                        const dmItem = el.closest('li:has(a[href*="/channels/@me/"]), .bdf-dm-item');
                        if (dmItem && dmItem !== dragState.sourceLi) {
                            const targetChId = getDMChannelIdFromElement(dmItem);
                            if (targetChId && targetChId !== dragState.channelId) {
                                const sourceFolder = findFolderOfChannel(dragState.channelId);
                                const targetFolder = findFolderOfChannel(targetChId);

                                if (targetFolder && sourceFolder && targetFolder.id === sourceFolder.id) {
                                    // Reorder within same folder
                                    hitTarget = dmItem;
                                    const rect = dmItem.getBoundingClientRect();
                                    hitAction = (e.clientY < rect.top + rect.height / 2) ? "INSERT_BEFORE" : "INSERT_AFTER";
                                } else if (targetFolder) {
                                    // Target belongs to a folder -> add to that folder
                                    hitTarget = targetFolder;
                                    hitAction = "ADD_TO_FOLDER_VIA_ITEM";
                                } else {
                                    // Combine two unfiled DMs into a new folder
                                    hitTarget = dmItem;
                                    hitAction = "CREATE_FOLDER";
                                }
                                break;
                            }
                        }

                        // Hover over unfiled list / header -> Move out of folder
                        const nav = el.closest('nav[class*="privateChannels_"], nav[aria-label*="Private Channels"]');
                        if (nav) {
                            const sourceFolder = findFolderOfChannel(dragState.channelId);
                            if (sourceFolder) {
                                hitTarget = nav;
                                hitAction = "MOVE_OUT";
                            }
                        }
                    }
                }

                // Update visuals based on hitAction
                if (currentDropTarget !== hitTarget || currentDropAction !== hitAction) {
                    removeDropVisuals();
                    currentDropTarget = hitTarget;
                    currentDropAction = hitAction;

                    if (hitAction === "CREATE_FOLDER" && hitTarget) {
                        hitTarget.classList.add("bdf-drop-combine");
                        hitTarget.setAttribute("data-bdf-drop-label", "+ Nowy Folder");
                    } else if (hitAction === "ADD_TO_FOLDER" && hitTarget) {
                        hitTarget.classList.add("bdf-drop-hover");
                    } else if (hitAction === "ADD_TO_FOLDER_VIA_ITEM" && hitTarget) {
                        const fHeader = ul.querySelector(`.bdf-folder-header[data-folder-id="${hitTarget.id}"]`);
                        if (fHeader) fHeader.classList.add("bdf-drop-hover");
                    } else if ((hitAction === "INSERT_BEFORE" || hitAction === "INSERT_AFTER" || hitAction === "REORDER_FOLDER_BEFORE" || hitAction === "REORDER_FOLDER_AFTER") && hitTarget && insertLineEl) {
                        const rect = hitTarget.getBoundingClientRect();
                        insertLineEl.style.display = "block";
                        insertLineEl.style.width = (rect.width - 16) + "px";
                        insertLineEl.style.left = (rect.left + 8) + "px";
                        const isBefore = (hitAction === "INSERT_BEFORE" || hitAction === "REORDER_FOLDER_BEFORE");
                        insertLineEl.style.top = (isBefore ? rect.top - 1 : rect.bottom - 1) + "px";
                    }
                }
            });

            document.addEventListener("mouseup", () => {
                if (!dragState) return;

                const wasDragging = dragState.isDragging;
                const dState = dragState;
                const target = currentDropTarget;
                const action = currentDropAction;

                removeDropVisuals();
                dragState = null;

                if (!wasDragging) return;

                setTimeout(() => { justDragged = false; }, 150);

                // 1. REORDER FOLDERS
                if ((action === "REORDER_FOLDER_BEFORE" || action === "REORDER_FOLDER_AFTER") && target) {
                    const targetFolderId = target.getAttribute("data-folder-id");
                    const fromIdx = state.folders.findIndex(f => f.id === dState.folderId);
                    if (fromIdx !== -1 && targetFolderId) {
                        const [moved] = state.folders.splice(fromIdx, 1);
                        let toIdx = state.folders.findIndex(f => f.id === targetFolderId);
                        if (toIdx !== -1) {
                            if (action === "REORDER_FOLDER_AFTER") toIdx++;
                            state.folders.splice(toIdx, 0, moved);
                            saveState();
                            reconcileFolders();
                        }
                    }
                    return;
                }

                // 2. DM ACTIONS
                const draggedChannelId = dState.channelId;

                if (action === "CREATE_FOLDER" && target) {
                    const targetChId = getDMChannelIdFromElement(target);
                    if (targetChId && targetChId !== draggedChannelId) {
                        const newFolder = {
                            id: "dmf_" + Math.random().toString(36).slice(2, 9),
                            name: "Nowy Folder",
                            color: "#f0b232",
                            collapsed: false,
                            channelIds: [draggedChannelId, targetChId]
                        };
                        showFolderModal(newFolder, true);
                        state.folders.unshift(newFolder);
                        saveState();
                        reconcileFolders();
                    }
                } else if (action === "ADD_TO_FOLDER" && target) {
                    const fId = target.getAttribute("data-folder-id");
                    const folder = findFolderById(fId);
                    if (folder) {
                        state.folders.forEach(f => {
                            f.channelIds = (f.channelIds || []).filter(id => id !== draggedChannelId);
                        });
                        folder.channelIds.push(draggedChannelId);
                        saveState();
                        reconcileFolders();
                    }
                } else if (action === "ADD_TO_FOLDER_VIA_ITEM" && target) {
                    const folder = target;
                    state.folders.forEach(f => {
                        f.channelIds = (f.channelIds || []).filter(id => id !== draggedChannelId);
                    });
                    folder.channelIds.push(draggedChannelId);
                    saveState();
                    reconcileFolders();
                } else if (action === "MOVE_OUT") {
                    state.folders.forEach(f => {
                        f.channelIds = (f.channelIds || []).filter(id => id !== draggedChannelId);
                    });
                    saveState();
                    reconcileFolders();
                } else if ((action === "INSERT_BEFORE" || action === "INSERT_AFTER") && target) {
                    const targetChId = getDMChannelIdFromElement(target);
                    const folder = findFolderOfChannel(targetChId);
                    if (folder) {
                        folder.channelIds = (folder.channelIds || []).filter(id => id !== draggedChannelId);
                        const tIdx = folder.channelIds.indexOf(targetChId);
                        const insertIdx = (action === "INSERT_BEFORE") ? Math.max(0, tIdx) : tIdx + 1;
                        folder.channelIds.splice(insertIdx, 0, draggedChannelId);
                        saveState();
                        reconcileFolders();
                    }
                }
            });
        }

        // ---------- Observer Setup ----------
        function setupObserver() {
            const ul = getDMListUl();
            if (ul) {
                if (mutationObserver) mutationObserver.disconnect();
                mutationObserver = new MutationObserver(() => {
                    scheduleReconcile();
                });
                mutationObserver.observe(ul, { childList: true });
                reconcileFolders();
            } else {
                setTimeout(setupObserver, 500);
            }
        }
        setupObserver();

        const pollInterval = setInterval(() => {
            if (!running) return;
            const ul = getDMListUl();
            if (ul) {
                const headerAnchor = ul.querySelector('[class*="privateChannelsHeaderContainer"]') || ul.querySelector('h2');
                const rootContainer = ul.querySelector("#bdf-folders-container");
                if (headerAnchor && (!rootContainer || headerAnchor.nextSibling !== rootContainer)) {
                    reconcileFolders();
                }
            }
        }, 1200);

        // ---------- Shift + Right-click: quick "Add to folder" menu (no dragging) ----------
        // Discord's normal right-click menu is left untouched; hold the chosen key to open this instead.
        let bdfMenu = null;
        const closeBdfMenu = () => { if (bdfMenu) { bdfMenu.remove(); bdfMenu = null; } };
        const mkRow = (menu, label, onClick, dotColor, checked) => {
            const it = document.createElement("div");
            it.setAttribute("style", "display:flex;align-items:center;gap:9px;padding:7px 8px;border-radius:5px;cursor:pointer");
            it.addEventListener("mouseenter", () => it.style.background = "rgba(157,191,234,.16)");
            it.addEventListener("mouseleave", () => it.style.background = "");
            if (dotColor !== undefined) { const d = document.createElement("i"); d.setAttribute("style", "width:9px;height:9px;border-radius:3px;flex:none;background:" + (dotColor || "#4e5058")); it.appendChild(d); }
            const t = document.createElement("span"); t.textContent = label; t.setAttribute("style", "flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"); it.appendChild(t);
            if (checked) { const c = document.createElement("span"); c.textContent = "✓"; c.style.color = "#9dbfea"; it.appendChild(c); }
            it.addEventListener("click", (ev) => { ev.stopPropagation(); closeBdfMenu(); onClick(); });
            menu.appendChild(it);
        };
        function openFolderMenu(chId, x, y) {
            closeBdfMenu();
            const cur = findFolderOfChannel(chId);
            const menu = document.createElement("div");
            menu.className = "bdf-ctxmenu";
            menu.setAttribute("style", "position:fixed;z-index:100001;min-width:200px;max-height:340px;overflow:auto;padding:5px;border-radius:8px;" +
                "background:#111214;border:1px solid #202020;box-shadow:0 8px 32px rgba(0,0,0,.55);font:500 13px var(--font-primary,'gg sans','Noto Sans',sans-serif);color:#dbdee1");
            const head = document.createElement("div");
            head.setAttribute("style", "padding:4px 8px 6px;font-size:10.5px;font-weight:700;letter-spacing:.04em;color:#9dbfea;text-transform:uppercase");
            head.textContent = "Add to folder";
            menu.appendChild(head);
            if (!state.folders.length) {
                const none = document.createElement("div");
                none.setAttribute("style", "padding:6px 8px;color:#949ba4;font-size:12px");
                none.textContent = "No folders yet — make one below.";
                menu.appendChild(none);
            }
            for (const f of state.folders) {
                const inHere = (f.channelIds || []).includes(chId);
                mkRow(menu, f.name, () => {
                    state.folders.forEach(x => { x.channelIds = (x.channelIds || []).filter(id => id !== chId); });
                    if (!inHere) f.channelIds.push(chId);
                    saveState(); reconcileFolders();
                }, f.color, inHere);
            }
            const sep = document.createElement("div");
            sep.setAttribute("style", "height:1px;margin:5px 4px;background:#202020");
            menu.appendChild(sep);
            mkRow(menu, "＋  New folder…", () => {
                const nf = { id: "dmf_" + Math.random().toString(36).slice(2, 9), name: "New Folder", color: "#9dbfea", collapsed: false, channelIds: [chId] };
                state.folders.forEach(x => { x.channelIds = (x.channelIds || []).filter(id => id !== chId); });
                showFolderModal(nf, true);
                state.folders.unshift(nf);
                saveState(); reconcileFolders();
            });
            if (cur) mkRow(menu, "Remove from “" + cur.name + "”", () => {
                cur.channelIds = (cur.channelIds || []).filter(id => id !== chId);
                saveState(); reconcileFolders();
            });
            document.body.appendChild(menu);
            const r = menu.getBoundingClientRect();
            menu.style.left = Math.max(8, Math.min(x, window.innerWidth - r.width - 8)) + "px";
            menu.style.top = Math.max(8, Math.min(y, window.innerHeight - r.height - 8)) + "px";
            bdfMenu = menu;
        }
        const onFolderCtx = (e) => {
            if (!running) return;
            const key = api.settings.get("menuKey", "shift");
            const held = key === "ctrl" ? e.ctrlKey : key === "alt" ? e.altKey : e.shiftKey;
            if (!held) return;
            const li = e.target.closest && e.target.closest('.bdf-dm-item, li:has(a[href*="/channels/@me/"]), a[href*="/channels/@me/"]');
            if (!li) return;
            let chId = null;
            try { chId = getDMChannelIdFromElement(li); } catch { }
            if (!chId) { const a = li.matches && li.matches('a[href]') ? li : (li.closest && li.closest('a[href*="/channels/@me/"]')) || (li.querySelector && li.querySelector('a[href*="/channels/@me/"]')); const m = a && /\/channels\/@me\/(\d+)/.exec(a.getAttribute("href") || ""); chId = m && m[1]; }
            if (!chId || chId === "@me" || !/^\d+$/.test(String(chId))) return; // real DM channels only, not Friends
            e.preventDefault(); e.stopPropagation();
            openFolderMenu(String(chId), e.clientX, e.clientY);
        };
        document.addEventListener("contextmenu", onFolderCtx, true);
        document.addEventListener("click", closeBdfMenu, true);
        document.addEventListener("scroll", closeBdfMenu, true);
        api.cleanup(() => {
            closeBdfMenu();
            document.removeEventListener("contextmenu", onFolderCtx, true);
            document.removeEventListener("click", closeBdfMenu, true);
            document.removeEventListener("scroll", closeBdfMenu, true);
        });

        api.cleanup(() => {
            running = false;
            clearInterval(pollInterval);
            clearTimeout(reconcileTimer);
            if (mutationObserver) mutationObserver.disconnect();
            removeDropVisuals();
            const rootContainer = document.querySelector("#bdf-folders-container");
            if (rootContainer) rootContainer.remove();
            if (dynamicHidingStyleEl) dynamicHidingStyleEl.remove();
            const backdrop = document.querySelector(".bdf-modal-backdrop");
            if (backdrop) backdrop.remove();
        });

        api.log("DM Folders v1.1.1 started successfully!");
    },

    stop(api) {
        api.log("DM Folders stopped.");
    },

    options(api) {
        const { h, row, note, select } = api.ui;
        return [
            note("Two ways to organize DMs into folders:\n  1) Drag a DM onto a folder (or onto another DM to make a new folder).\n  2) Hold the key below and right-click a DM to pick a folder (or make a new one). Right-click a folder header to rename / recolor it."),
            select ? row("Quick “Add to folder” menu", select([["shift", "Shift + right-click"], ["ctrl", "Ctrl + right-click"], ["alt", "Alt + right-click"]], api.settings.get("menuKey", "shift"), v => api.settings.set("menuKey", v))) : null,
            note("Przeciągaj foldery lub DM-y lewym przyciskiem myszy, aby je sortować, łączyć w foldery, dodawać i wyjmować! Kliknij prawym przyciskiem myszy na nagłówek folderu, aby zmienić nazwę lub kolor."),
            row("Resetuj wszystkie foldery", (() => {
                const b = h("button", {
                    type: "button",
                    style: "padding: 6px 14px; background: #f23f42; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-weight: 600;"
                }, "Wyczyść foldery DM");
                b.addEventListener("click", () => {
                    if (confirm("Czy na pewno chcesz usunąć wszystkie foldery DM? Twoje wiadomości nie zostaną usunięte, a DM-y powrócą na listę główną.")) {
                        api.settings.set("folders", []);
                        location.reload();
                    }
                });
                return b;
            })())
        ];
    }
});
