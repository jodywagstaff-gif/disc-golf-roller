# Disc Roller — League Arcade

A mobile-first disc golf arcade with timing-based reels, optional player names and stroke scores, and offline play. Start opens a viewport-filling roller with large controls. No configuration, roster or tutorial is required. Scores, Setup and Help open on demand in separate modal panels. The original deployed prototype is preserved separately in `archive/netlify-2026-10-04/`; this is a new implementation based on that recovered public client, not a recovered original source repository.

## Run, test, build

Node.js 20 or later. No runtime packages, API keys, accounts, or dependency installation are needed.

```sh
node server.mjs
# Open http://127.0.0.1:4173
node --test tests/model.test.mjs
node build.mjs
```

The build copies an explicit allowlist of public app assets to `dist/`. Tests, archived source, review screenshots and private local files are not published.

Optional browser tests use Playwright. Install it in your development environment, start the local server, then run `node tests/browser.mjs`. `PLAYWRIGHT_MODULE` can point to an existing Playwright package; `CHROME_PATH` can select installed Chrome. `TEST_URL` changes the target. Tests create isolated browser contexts with fictional players only. Output is saved under ignored `review/`.

`node tests/slot-browser.mjs` checks reel behavior and layouts. `node tests/update-browser.mjs` starts its own isolated server and tests upgrades with multiple tabs, an active spin, saved scores and offline operation. It downloads the exact c764a9c and 649e4a5 public source fixtures from GitHub unless already present in `review/upgrade-fixtures/`; it never uses an existing browser profile.

## Play and scoring

- Free play is the default. Start, then Roll. No player names or score settings are required.
- Optional Setup lets you add/select players, choose a hole, adjust difficulty and switch/start rounds. Scores shows one hole at a time with large number fields and plus/minus controls. Help is on demand.
- Opening a menu or returning to the splash pauses the reel. Close, Escape and browser Back preserve the challenge; Resume restarts it. Refresh retains the screen and saved progress. Switching players or rounds is disabled during an unfinished challenge.
- Each scrolling reel starts fast and eases to a stop over 3.8 seconds. Stop catches the option nearest the center of the last painted frame. The selected item aligns and holds for 550 ms before the next stage starts. There is no separate random draw: consecutive spins travel 20 through 26 positions in a repeating sequence. Original pools and wildcard choices are retained.
- Reduced-motion mode uses a still display updated at most four times per second, with the same automatic stop and manual control. Menus, backgrounding, and page exit cancel both animation frames and pending settling callbacks. Resume starts a new spin of the unfinished stage; accepted choices remain saved.
- Difficulty changes normalize the current index before play resumes. Backgrounding pauses the reel; refreshing restores the selected stages and offers Resume.
- Scorecards count normal strokes per hole. Blank means unplayed; zero is rejected. Corrections replace a score; clearing it restores blank. Totals show holes recorded and are explicitly partial until complete.
- First round: **9 holes**. New rounds may contain **9 or 18 holes**. Use the round selector to revisit earlier scores. No real course par is assumed and no relative-to-par standings are displayed.
- Current preview supports up to 24 players, with unique names up to 32 characters. Duplicate names can be distinguished with initials.
- Adding a player adds them to the currently selected round. Starting a new round includes all saved players.
- Challenge history shows the latest 30 challenges in the current round; all remain in the exported data.

## Persistence, privacy, and limitations

Names, scores, settings, completed challenges and partial challenges are stored **only in this browser's localStorage** under `disc-roller.league.v1`. There are no accounts, analytics, third-party network assets or remote player-data requests. Hosting still receives normal page-request metadata. Backups downloaded by the user contain player names and scores; keep them private.

Export a JSON backup from the Scores panel. Browser data is not a permanent server backup: clearing browser/site data, changing origins/devices or browser eviction can remove it. Import/recovery UI is not implemented yet. Existing corrupted/unsupported data is not overwritten; export and troubleshoot before continuing. Storage errors are visible and failed changes do not get reported as saved.

Revision checks plus Web Locks (where available) guard against competing tabs. Changes in another tab stop editing until reload. Without Web Locks the fallback revision check is not a complete simultaneous-write guarantee; use one tab. Multi-phone synchronization is **not implemented**.

The app shell and bundled font are cached by a service worker after an online visit. Wait for **Ready for offline play** before relying on it. The browser must support service workers and retain its cache. A completed update activates for the next navigation without reloading open games. Help offers **Check for updates** and an explicit reload button; reload waits until the current challenge is complete and pending saves finish. The splash also shows an update button. Existing scores stay in localStorage. Old public shell caches are retained; no player data is stored in them. Bump the cache version in `sw.js` for each asset release. The build stamps `release.js` and `version.json` with the deployment commit so an open app can distinguish its loaded version from the server. The SVG manifest icon is adequate for this preview; platform-specific install icons and real iOS testing are follow-up work.

If an older installed version has no update button, open it online, allow a few seconds for its worker to update, and reload after finishing the current challenge. A second reload may be needed if the first installed the update. Do not clear site data to update: that would delete local scores. Other open tabs are never forcibly reloaded.

## Architecture and future modes

- `model.js`: versioned domain schema, UUID player/round/hole/score/challenge IDs, validated commands, stroke-play rules, local repository adapter.
- `app.js`: DOM/controller; names use text nodes, never HTML interpolation. The active reel is ephemeral; accepted choices are persisted.
- `style.css` / `assets/`: locally served arcade design and custom pixel course illustration.
- `sw.js`: public app-shell cache, no player data.

The score mode is `{id: 'stroke-play', version: 1}`. Later modes should add explicit validation and scoring strategies plus data migrations rather than reinterpret stored strokes. Stable entity/event IDs, device IDs, revisions, timestamps, and a command log establish a boundary for a future remote repository. They are not a working sync engine: membership/access control, server-authoritative conflict resolution, idempotent transport, and retention/compaction still need design. No unused backend or credentials are provisioned.

## GitHub and Render preview

`render.yaml` defines a **static site**, not a paid web service: `disc-golf-roller-preview`, branch `main`, build `node --test tests/model.test.mjs && node build.mjs`, publish `dist`. No secrets or environment variables are needed. Auto-deploy is configured to wait for checks. CI runs the domain regressions and static build.

Create the static site in the authorized Render workspace, using this repository and configuration. Confirm no paid add-ons or resources are selected. Verify the exact deployed commit, build logs, HTTPS, response headers, and browser/offline checks before treating it as the replacement. The existing Netlify site is deliberately untouched. Render account limits/usage still apply; see [Render static sites](https://render.com/docs/static-sites) and [Blueprint reference](https://render.com/docs/blueprint-spec).

This repository contains no deployment credential. `server.mjs` is only a loopback development server; Render publishes `dist` directly.

## Asset license

Press Start 2P is bundled under the SIL Open Font License; see `assets/OFL.txt`. The pixel course SVG and interface were authored for this upgrade.
