# Gym App — Design (v2, approved 11 Nov 2026)

Approved by Vik on 11 Nov 2026. Visual reference: `docs/preview.html` (approved preview).

## Why
The Google Sheet works as a record but is fiddly on a phone mid-set. Vik wants a real app on his home screen, next to Spotify: fast, clean, premium-looking, not "AI slop". He chose to build it properly from the start. He trains Mon–Sat around 6:30 am, 4–6 days a week, is in no rush (sessions can run past an hour), and legs are his weak area after a knee injury.

## Goals
- Open the app → today's session is already set (date automatic, exercises listed) → Start → log.
- Log a set in one tap (pre-filled target); adjust with big ± buttons or a sideways swipe on the number. No typing.
- Works with no signal; syncs to the Google Sheet when online.
- Last time + target on every set; PR badges; "add weight" flags.
- Progress by muscle and by exercise; weekly sets per muscle vs 10–20.
- Spotify control inside the app: play/pause, skip, playlists, suggestions.
- Few notifications.

## Non-goals
- Food / calorie logging (MyFitnessPal). Watch / heart rate. Social features. Supersets.

## Anti-goals
- Typing dates or exercise names → failure.
- Losing a set → failure (saved on phone first, then synced).
- Opening inside the Claude app → failure.
- Busy home screen, nagging notifications, generic AI look.

## Approaches considered
1. Apps Script web app on the Sheet — simple, but online-only, Google banner, slow loads.
2. Claude-hosted app — quick to build, but claude.ai links may open in the Claude app.
3. **Installable offline-first web app on GitHub Pages, syncing to the Sheet — chosen by Vik.** Public repo is fine with him; no data or keys in the repo.

## How it fits together
- App installed from **Chrome** (real Android app icon; Samsung Internet only makes a shortcut).
- Every action saves to the phone's storage immediately; a sync queue sends sets to a small Apps Script bound to the Sheet when online (text/plain POST, unique set IDs so retries never duplicate; edits/deletes update the same row). First launch pulls existing Log rows and the exercise list.
- The Sheet stays the permanent record and backup (clearing Chrome data wipes the phone copy). Edits are made in the app; direct Sheet edits are not pulled back. Manual export as a backup.
- Script URL + secret key and Spotify login live only on the phone (Settings).
- All fonts and screens bundled so it works fully offline.

## Screens
1. **Today (home)** — date, sync dot, greeting, one card: session name, sets, estimated time, exercise list, **Start workout**, "Swap day". Below: at most two short lines (e.g. week progress, legs last trained / overdue, easy-week due). Spotify bar. Bottom nav: Today · Progress · Week.
2. **Workout** — header: session, workout clock, estimated finish time, segmented bar (one segment per set). Exercises in order as straight sets (no supersets). Each set row: set #, last time, kg, reps, ✓. Next set highlighted.
   - ✓ logs pre-filled values; row fills blue; PR badge + short banner when beaten.
   - Sideways swipe on kg/reps steps the value; tap opens the ± panel (big −/+, hold to repeat, Same as last, +1 step, Drop set, Save set).
   - Tap a done set to edit; swipe left to delete; 5-second Undo.
   - Long-press set # → mark Warm-up (W), excluded from PRs, volume and weekly sets.
   - Swap exercise per slot (today only or from now on).
   - Per-exercise note (e.g. seat 4, pin 6) shown on the card.
   - Single-arm exercises ask once whether kg is per arm; assisted exercises invert PR logic.
   - Optional "felt it" tap on leg sets; twice in a row → next target holds weight.
   - Finish → summary: total time, sets, volume, PRs, average rest, work vs waiting, estimated calories with the "don't add to MyFitnessPal" reminder.
3. **Progress** — Muscles view (default): strength change over 4 weeks + mini bars of sets/week per muscle, amber when under 10; tap → trend chart and its exercises. "Not enough data yet" until 3 sessions. Exercises view: Add weight / Keep building flags, chart per exercise.
4. **Week** — sets per muscle vs 10–20, freshness (days since), 8-week calendar, weekly session target (no daily streak), pause/injury mode.
5. **Settings** — Sheet link + key, Spotify connect, rest defaults, weight steps per exercise, sync status, export, repeat last workout.

## Session selection
Automatic, not tied to weekday: next = the muscle group trained longest ago (Chest + Back / Legs / Shoulders + Arms), alternating A and B variants. Tomorrow (Thu 12 Nov) → Chest + Back B. "Swap day" picks any of the six.

## Programme changes agreed in this design
- Straight sets only (gym is busy; no supersets).
- Chest + Back B: 1 Converging chest press · 2 Seated machine row · 3 Smith incline press · 4 Neutral-grip pulldown · 5 Pec fly machine · 6 **Straight-arm cable pulldown** (replaces wide-grip cable row; goal: back width). Wide-grip row stays in the swap list.
- Back day logic: one vertical pull + one horizontal pull, plus one extra slot.

## Timers
- **Workout clock**: starts on Start workout (after warm-up), stops on Finish (before stretching). Auto-ends 15 min after the last set if Finish is forgotten.
- **Rest timer**: starts automatically after every set. Defaults 3:00 for compounds (presses, pulldowns, rows, leg press, deadlift), 2:00 for isolations; per-exercise up to 5:00. At zero it buzzes, turns amber and counts up (+0:20…). Actual rest is measured between ticks regardless.
- Screen kept awake during a workout (Wake Lock). A closed/backgrounded app cannot alert — known platform limit.

## Spotify
Premium account; one personal developer app (Development Mode, owner Premium). Slim player bar: track, artist, prev / play-pause / next, swipe to skip. Music panel: **For your workout** (search results for gym / workout / leg day, up to 10 each, pinnable), **Your playlists**, **Liked songs**, **Recently played**. Spotify plays in the background; the app is the remote; needs internet. Suggestions come from search (Spotify withholds curated/recommended playlists from new apps). Playback of searched playlists to be verified first in the build.

## Notifications
- In app only: rest over (buzz + amber), PR banner, "legs overdue", "easy week due", weekly summary line on Today.
- Training reminder: Google Calendar event "Gym", Mon–Sat 6:30–7:30 am, 15-min popup (already created).
- No daily streaks; weekly session target; pause/injury mode silences overdue lines.

## Look and motion
- Dark graphite ground, one blue meaning "done", amber for PRs and over-rest only.
- Type: **Albert Sans** for text and headings; **Red Hat Display** for numbers (kg, reps, timers), tabular figures.
- Press feedback (scale 0.97), strong ease-out under 300 ms, iOS-style drawer curve for panels, drag-to-dismiss with velocity, rubber-band at edges, fill sweep on done sets, reduced-motion fades. Touch targets ≥ 48 px (± buttons 64 px). Buzz on set done and rest over.

## Tech (Claude's call)
Vite + Svelte + TypeScript; Motion for springs; idb (IndexedDB) + storage persistence; vite-plugin-pwa; GitHub Actions → GitHub Pages; hash routing; Apps Script doGet/doPost bridge; Spotify Web API with PKCE.

## Vik's one-time setup (~15 min, laptop easiest)
1. Paste the script into the Sheet (Extensions → Apps Script) → Deploy as web app → copy link + key into the app.
2. Register a Spotify developer app (personal use) → paste its client ID; log in once.
3. Open the app in Chrome on the phone → Install / Add to Home screen.

## Later
Body map of muscles, plate calculator, custom domain.
