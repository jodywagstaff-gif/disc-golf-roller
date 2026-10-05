# Disc Roller — on-course league preview

A mobile-first disc golf challenge roller and local scorecard for passing one phone around a card. Free play works immediately without a roster. Optional players each get a distinct, stable color and numbered identity. The main screen names the player who is up; completed challenges offer an explicit handoff to the next unrolled player.

## Run and verify

Node.js 20 or later; no runtime dependencies or credentials.

```sh
node server.mjs
node --test tests/model.test.mjs tests/course-model.test.mjs
node build.mjs
```

The local server binds only to 127.0.0.1:4173 (PORT may override it). The static build publishes an explicit asset allowlist. Archived source, tests, review files and local private files are excluded.

Optional browser tests need Playwright and a Chromium installation. PLAYWRIGHT_MODULE and CHROME_PATH can point to existing installations; TEST_URL selects the local server or authorized preview. Tests use isolated storage and fictional players.

- node tests/course-browser.mjs — manual section starts, four-player handoff, honors, four visible score rows, eight-player touch scrolling, par, ace cue, score symbols, offline scores.
- node tests/course-safety-browser.mjs — exact Quick Stop boundaries, saved resume, reduced motion, layouts, contrast, migration, stale tabs and corrupt data.
- node tests/update-browser.mjs — an isolated server reproduces older cached versions and verifies multi-tab updates without forced reloads or lost data. It reads exact public GitHub fixtures when not already cached under review/.
- Earlier browser/slot/revision/scorecard test entry points forward to the current suites.

## Play and handoff

Tap **Begin Disc**, **Begin Stability**, and **Begin Shot** separately. A finished reel never starts the next section automatically. Each started reel lasts 3.8 seconds and eases to its final item. Quick Stop is accepted only while elapsed time is strictly less than one third (1266.67 ms), including at the input-handler boundary. Afterward the disabled control says **Let it spin**. A choice holds for 550 ms before being saved.

Menus and backgrounding pause drawing, not the saved spin deadline. Resume never reopens a closed Quick Stop window; an expired reel finishes when resumed. Reduced motion uses a still display with the same deadline. Timing determines the selected item; there is no separate random draw. Original option pools and wildcard choices remain available.

After all three choices, a named **Pass to…** button switches to the first remaining player. That player must tap Begin Disc. After every player has a challenge, **Score hole** opens quick entry. An unfinished challenge blocks player or playing-hole changes. Setup still permits explicit player selection and rerolls. The numbered player colors stay stable across rounds and reloads; names remain the primary identifier.

## Quick scoring and full card

Scores opens a compact hole-entry panel. At least four player rows fit at 320×480 portrait; larger rosters scroll inside the player list while Save and navigation remain visible. Swipe a score wheel horizontally or use +/−; a vertical swipe scrolls longer player lists. These controls are non-text elements, so score entry does not invoke a numeric keyboard. Keyboard users can use arrow keys, Home/End and Page Up/Down. Player-name entry in Setup intentionally remains a text field.

**— means unplayed**, not zero or par. Scores range from 1 to 99. Scrolling only changes pending choices; **Save scores** writes the whole hole atomically. Back discards unsaved choices. Save before opening the Full card or another scoring hole. Opening the par editor preserves pending choices.

**Full card** is a separate view with all players, hole scores, par and running totals. Totals remain marked partial until every hole is entered. Tap a hole or score to edit it. Birdies use blue circles; better-than-birdie scores use a double circle; par is a plain number; bogeys use red squares; double bogey or worse uses a darker red square with a double border. Labels and shapes supplement color. A confirmed transition to a score of 1 triggers a brief ACE cue; rendering, reopening or saving the same ace does not replay it. Reduced motion suppresses its animation.

Every hole starts at **par 3**. Tap the par label to choose 2–9; editing par never changes strokes. Rounds have 9 or 18 holes. The roster limit remains 24, not four. New rounds include all saved players; earlier rounds remain available in Setup.

## Tee order

Hole 1 uses roster order. On each following hole, players are sorted by their score on the **previous hole**, with ties retaining the previous tee order. This is not a cumulative-total ranking. Thus a player who earns honors on hole 1 keeps them for hole 3 if everyone ties on hole 2.

Missing scores hold Next hole and forward playing-hole selection; they never count as zero or silently decide honors. After every player has a saved score, Next hole selects the first player in the resulting order. Established tee orders are stored when a hole begins; later corrections do not rewrite the order already used on that hole. Scores can be entered without requiring every player to use the challenge roller.

## Data, migration and privacy

Names, colors, pars, strokes, rounds, challenges and progress stay in this browser's localStorage under disc-roller.league.v1. The key is retained for compatibility; the current data schema is **2**. No account, analytics or remote player-data request is used. Hosting receives ordinary page-request metadata.

Schema-1 saves are migrated in memory without writing on load. Existing strokes, IDs, history, selected player and unfinished challenge survive; old unset pars become the requested default 3, unplayed holes stay unplayed, and players receive stable colors. Before the first schema-2 write, the byte-exact original is retained at disc-roller.league.v1.pre-v2. An old app cannot overwrite a newer schema it does not support. Unknown/corrupt saves are preserved and editing is blocked.

Full card includes JSON backup export. Browser storage is not a server backup; clearing site data, device changes or browser eviction can remove it. Import UI and multi-phone synchronization are not implemented. Exported files contain player names and scores and should be kept private.

Revision checks plus Web Locks (when available) guard competing tabs. Another tab's edit blocks stale writes until reload. Without Web Locks, the fallback revision check is not a complete simultaneous-write guarantee; use one editing tab. Failed saves preserve the previous state and show an error.

## Offline and updates

Wait for **Ready for offline play** after an online visit. The service worker caches only public assets. Completed updates activate for the next navigation without forcing open games to reload. Help has Check for updates and an explicit reload action that waits for a completed challenge and pending saves. Version stamps identify the actual loaded and deployed commit. Concurrent update signals are queued, and a known pending release gets up to five short rechecks while activation settles. Old public caches are retained; updates never clear player storage.

Older installed copies may need an online reload, a short wait for download, then another reload. Do not clear site data to update. Bump the shell cache version for every asset release. Physical iOS/Safari testing remains a follow-up; automated mobile tests use Chromium touch emulation.

## Architecture and deployment

- model.js: versioned state, migration, validated commands, stable identities, tee order, par and stroke rules, local persistence.
- app.js / reel-motion.js: screens, explicit player handoff and reel timing.
- score-ui.js: compact stroke wheels, atomic save, full card, par editor and ace cue.
- theme.js / style.css: saved Day/Night choice, system default, on-course colors and responsive layout.
- sw.js / build.mjs: offline shell and explicit public build assets.

GitHub CI runs both model suites and builds the static site. render.yaml describes the existing static Render preview, with deployment after checks pass. The loopback server is development-only. No backend or deployment credential is provisioned by this code.

The original recovered public prototype remains in archive/netlify-2026-10-04/. The original Netlify deployment is untouched. This is a new implementation based on that recovered client, not a recovered original source repository.

The full-card interaction was informed by [UDisc's official scorecard guide](https://help.udisc.com/en/articles/11391658-how-do-i-use-the-scorecard). This app uses its own UI and assets, with no UDisc integration. Press Start 2P remains bundled under the SIL Open Font License in assets/OFL.txt; the course SVG was authored for this project.
