// 2048: a quick self-contained mini-game in a beecord popup. Open with Ctrl+Shift+G, play with the
// arrow keys (or WASD), R for a new game, Esc to close. Your best score is saved. No Discord data touched.
(window.beecord || window.blxstncord).definePlugin({
    id: "mini-2048",
    name: "2048",
    description: "A tiny 2048 game. Ctrl+Shift+G to open, arrow keys / WASD to play, R for new game. Best score is saved.",
    author: "beecord",
    version: "1.0.0",
    category: "Fun",
    enabledByDefault: false,
    webpack: false,

    start(api) {
        const h = api.ui.h;
        const N = 4;
        let board, score, best = Number(api.settings.get("best", 0)) || 0;
        let wrap = null, tiles = [], scoreEl, bestEl, overEl;

        const empty = () => { const r = []; for (let i = 0; i < N * N; i++) if (!board[i]) r.push(i); return r; };
        const spawn = () => { const e = empty(); if (e.length) board[e[Math.floor(Math.random() * e.length)]] = Math.random() < 0.9 ? 2 : 4; };
        const reset = () => { board = new Array(N * N).fill(0); score = 0; spawn(); spawn(); if (overEl) overEl.style.display = "none"; render(); };

        const slide = line => {
            const a = line.filter(x => x);
            for (let i = 0; i < a.length - 1; i++) if (a[i] === a[i + 1]) { a[i] *= 2; score += a[i]; a.splice(i + 1, 1); }
            while (a.length < N) a.push(0);
            return a;
        };
        const move = dir => { // 0 left, 1 right, 2 up, 3 down
            const before = board.join(",");
            for (let i = 0; i < N; i++) {
                let line = [];
                for (let j = 0; j < N; j++) line.push(board[dir < 2 ? i * N + j : j * N + i]);
                if (dir === 1 || dir === 3) line.reverse();
                line = slide(line);
                if (dir === 1 || dir === 3) line.reverse();
                for (let j = 0; j < N; j++) board[dir < 2 ? i * N + j : j * N + i] = line[j];
            }
            if (board.join(",") === before) return;
            spawn();
            if (score > best) { best = score; api.settings.set("best", best); }
            render();
            if (!canMove()) { if (overEl) overEl.style.display = "flex"; }
        };
        const canMove = () => {
            if (empty().length) return true;
            for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
                const v = board[i * N + j];
                if (j < N - 1 && v === board[i * N + j + 1]) return true;
                if (i < N - 1 && v === board[(i + 1) * N + j]) return true;
            }
            return false;
        };

        const COLORS = {
            0: ["transparent", "transparent"], 2: ["#2a2d33", "#cfd6e4"], 4: ["#33373f", "#cfd6e4"],
            8: ["#3c5a74", "#eaf1fb"], 16: ["#436a8c", "#eaf1fb"], 32: ["#4a7ba6", "#eaf1fb"],
            64: ["#5a90c0", "#0c1016"], 128: ["#6fa8d6", "#0c1016"], 256: ["#86bde6", "#0c1016"],
            512: ["#9dbfea", "#0c1016"], 1024: ["#b6d2f2", "#0c1016"], 2048: ["#d6e6fb", "#0c1016"]
        };
        const render = () => {
            if (!wrap) return;
            for (let i = 0; i < N * N; i++) {
                const v = board[i], t = tiles[i];
                const [bg, fg] = COLORS[v] || ["#e8f1ff", "#0c1016"];
                t.textContent = v || "";
                t.style.background = v ? bg : "rgba(255,255,255,.035)";
                t.style.color = fg;
                t.style.fontSize = v >= 1024 ? "18px" : v >= 128 ? "22px" : "26px";
                t.style.transform = v ? "scale(1)" : "scale(1)";
            }
            scoreEl.textContent = String(score);
            bestEl.textContent = String(best);
        };

        const close = () => { if (wrap) { wrap.remove(); wrap = null; tiles = []; } };
        const open = () => {
            close();
            wrap = h("div", { id: "beecord-2048" });
            wrap.style.cssText = "position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:100001;padding:16px;border-radius:14px;" +
                "background:var(--ig-popup,#141414);border:1px solid var(--ig-border,#202020);box-shadow:0 18px 60px rgba(0,0,0,.6);" +
                "font:600 13px var(--ig-font,ui-monospace,monospace);color:#dbdee1;user-select:none";
            const head = h("div", { style: "display:flex;align-items:center;gap:12px;margin-bottom:12px" },
                h("div", { style: "flex:1;font-size:16px;font-weight:800;color:var(--ig-accent,#9dbfea);letter-spacing:.02em" }, "2048"),
                stat("SCORE", scoreEl = h("b")), stat("BEST", bestEl = h("b")));
            const grid = h("div", { style: "position:relative;display:grid;grid-template-columns:repeat(4,64px);grid-template-rows:repeat(4,64px);gap:8px;padding:8px;border-radius:10px;background:rgba(0,0,0,.28)" });
            tiles = [];
            for (let i = 0; i < N * N; i++) {
                const t = h("div", { style: "display:flex;align-items:center;justify-content:center;border-radius:7px;font-weight:800;transition:background .12s,color .12s" });
                tiles.push(t); grid.append(t);
            }
            overEl = h("div", { style: "position:absolute;inset:8px;display:none;flex-direction:column;align-items:center;justify-content:center;gap:10px;border-radius:7px;background:rgba(10,12,16,.82);backdrop-filter:blur(2px)" },
                h("div", { style: "font-size:18px;font-weight:800;color:#f2f3f5" }, "Game over"),
                mkBtn("New game", () => reset()));
            grid.append(overEl);
            const foot = h("div", { style: "display:flex;align-items:center;gap:8px;margin-top:12px" },
                h("div", { style: "flex:1;font-size:10.5px;color:#949ba4" }, "Arrows / WASD · R new · Esc close"),
                mkBtn("New", () => reset()), mkBtn("Close", () => close(), true));
            wrap.append(head, grid, foot);
            document.body.append(wrap);
            reset();
        };
        const stat = (label, b) => h("div", { style: "min-width:60px;text-align:center;padding:5px 10px;border-radius:7px;background:rgba(255,255,255,.04);border:1px solid var(--ig-border,#202020)" },
            h("div", { style: "font-size:9px;letter-spacing:.08em;color:#949ba4" }, label), b);
        const mkBtn = (label, fn, sec) => { const b = h("button", { type: "button" }, label); b.style.cssText = "height:28px;padding:0 12px;border:0;border-radius:7px;cursor:pointer;font:700 11.5px var(--ig-font,monospace);" + (sec ? "background:#181818;color:#aab1bd;box-shadow:inset 0 0 0 1px #262626" : "background:var(--ig-accent,#9dbfea);color:#0c1016"); b.addEventListener("click", fn); return b; };

        const KEYS = { ArrowLeft: 0, ArrowRight: 1, ArrowUp: 2, ArrowDown: 3, a: 0, d: 1, w: 2, s: 3 };
        api.on(window, "keydown", e => {
            if (e.ctrlKey && e.shiftKey && !e.altKey && e.key.toLowerCase() === "g") { e.preventDefault(); e.stopPropagation(); wrap ? close() : open(); return; }
            if (!wrap) return;
            if (e.target && e.target.closest && e.target.closest('input, textarea, [contenteditable="true"]')) return; // don't hijack typing
            const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
            if (k in KEYS) { e.preventDefault(); e.stopPropagation(); move(KEYS[k]); }
            else if (k === "r") { e.preventDefault(); reset(); }
            else if (k === "Escape") { e.preventDefault(); close(); }
        }, true);
        api.cleanup(close);
    },

    options(api) {
        return [api.ui.note("Press Ctrl+Shift+G anywhere to open 2048. Arrow keys or WASD to move, R for a new game, Esc to close. Your best score is saved here.")];
    }
});
