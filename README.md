# Patina

A Chrome extension that restyles the web to match your aesthetic. Pick a patina — Terminal, 8-bit, Information Superhighway, Psychedelic, Enterprise, Soviet, Murica, or one you invent — and every site you visit gets the finish.

## What It Does

Patina uses an LLM (your key, your choice of provider) to generate a site-specific theme the first time you visit a site: a full stylesheet in your chosen aesthetic, plus placements for retro widgets like marquees, sparkle cursors, tiled backgrounds, hit counters, and badges. The theme is cached permanently, so every later visit to that site is instant, consistent, and costs nothing. Don't like the result? One click re-patinates the site in a different direction.

## Features

- **Seven built-in patinas** — each with an instant base theme and a rich spec the LLM uses for site-specific theming
- **Custom patinas** — describe any aesthetic in a sentence or two ("cottagecore", "Windows 95", "brutalist concrete") and Patina improvises it; edit or delete your creations in Options
- **Permanent per-site theme cache** — each site is themed once per patina; reloads and revisits apply instantly with zero LLM calls
- **Re-patinate** — one click regenerates a site's theme in a noticeably different direction
- **"Patinating…" curtain** — a per-patina loading interstitial covers a site's first visit until its theme is ready (skippable, 15-second cap, can be turned off in Options)
- **Retro widget runtime** — marquee headlines, sparkle cursor trails, tiled backgrounds, odometer hit counters, and badges, all shipped in the extension and placed by the LLM
- **Bring your own provider** — Anthropic, OpenAI, OpenRouter, Ollama (local), or any OpenAI-compatible endpoint
- **Per-site and global controls** — disable Patina on any site from the popup, or everywhere with one toggle
- **Safety denylist** — banking, health, and government sites are never themed by default (editable)

## Built-in Patinas

| Patina | The look |
|---|---|
| **Information Superhighway** | The 1998–2003 personal-homepage web: starfields, marquees, hit counters, beveled buttons, "Best viewed in Netscape Navigator 4.0" |
| **Terminal** | Phosphor CRT: green-on-black monospace, scanlines, blinking cursor |
| **8-bit** | NES-era: pixel fonts, chunky borders, hard primary palette |
| **Psychedelic** | Late-60s poster energy: tie-dye, bubble type, slow hue-shift headings |
| **Enterprise** | LCARS — the ST:TNG bridge computer: black, salmon/lavender/gold pills and elbows |
| **Soviet** | Constructivist propaganda: cream paper, red banners, condensed uppercase, star bullets |
| **Murica** | Maximal Americana: stars, stripes, eagles, slab type with red-white-and-blue everything |

## How to Install

This extension is not published to the Chrome Web Store. To install it manually:

1. Download or clone this repository to your local machine.
2. Open Chrome and navigate to `chrome://extensions`.
3. Enable **Developer mode** using the toggle in the top-right corner.
4. Click **Load unpacked** and select the folder containing this repository.
5. The Patina disc will appear in your Chrome toolbar.

## How to Use

1. **Add a key.** Open Patina's Options (toolbar icon → Options). Pick a provider, paste your API key, and choose a model. A fast, cheap model (`gpt-5.6-luna`, `claude-haiku-4-5`) is usually all Patina needs — each site is themed once and cached forever.
2. **Turn it on.** In Options, toggle **Enable everywhere** and accept Chrome's permission prompt. (Prefer per-site control? Skip the toggle and use **Patinate this page** in the popup instead.)
3. **Browse.** A new site shows a themed "Patinating…" curtain until its custom theme is ready (or, with the curtain off, the patina's instant base theme that upgrades in place). Everything after that is served from cache.
4. **Steer it.** From the popup: the power switch turns Patina off everywhere, and you can switch patinas, **♻️ Re-patinate** a site you're not happy with, or disable Patina for that site. In Options: create and edit custom patinas, manage the denylist, and view or delete cached themes.

Without an API key, the built-in patinas still apply their base themes — the LLM layer just stays off until you add one.

## How It Works

Content scripts run at `document_start` on every enabled site. On a cache hit, the stored theme applies before the page paints. On a first visit, the content script raises the "Patinating…" curtain (unless disabled), applies the patina's base theme beneath it, builds a small structural digest of the page (landmarks, common class names, a few computed colors and fonts), and hands it to the service worker, which asks your configured LLM for a theme envelope: a site-specific stylesheet plus widget placements. The curtain lifts when the theme applies — or after 15 seconds, whichever comes first. The envelope is validated against a closed widget catalog, the CSS is sanitized, and the result is cached per `(site, patina)` in `chrome.storage.local` — permanently, until you re-patinate or delete it.

The LLM only ever produces data (CSS and JSON). Every line of executable code ships in this repository, in line with Manifest V3's remote-code rules. Generated CSS is sanitized before it touches any page: no `@import`, no external `url()` (only bundled assets and `data:` URIs), no full-viewport overlays, 50KB cap.

## Permissions

| Permission | Purpose |
|---|---|
| `storage` | Save your settings and the per-site theme cache |
| `scripting` | Register content scripts dynamically and inject on demand |
| `activeTab` | Theme the current tab via "Patinate this page" without broad host access |
| `tabs` | Read the active tab's URL for the popup and reload after setting changes |
| `<all_urls>` *(optional)* | Only requested if you enable "everywhere" mode; lets Patina theme sites automatically as you browse |

## Privacy Policy

Patina sends data to exactly one place: the LLM provider **you** configure.

- **No analytics or telemetry** — the extension contains no tracking code of any kind.
- **Bring-your-own-key** — your API key is stored in `chrome.storage.local` on your machine and sent only to your chosen provider. There is no Patina server.
- **Minimal page data** — on a site's *first* visit per patina, a small structural digest (page title, hostname, landmark tags, common class names, a few computed colors/fonts) is sent to your provider to generate the theme. Page text, form contents, and personal information are never read or transmitted.
- **Cached thereafter** — repeat visits make no network requests at all.
- **Sensitive sites excluded** — banking, health, and government domains are on the default denylist and are never themed or digested unless you remove them.

## Development

- No build step, no runtime dependencies. Tests: `npm test` (Node ≥ 18.13, uses `node --test`).
- Design spec: `docs/superpowers/specs/2026-08-12-patina-design.md`
- Manual QA script: `docs/qa-checklist.md`

## License

MIT
