# Patina — Design Spec

**Date:** 2026-08-12
**Status:** Approved pending final review

## What it is

Patina is a Chrome extension (Manifest V3) that restyles the web, on the fly, to match a user-chosen aesthetic. An LLM generates a site-specific theme — freeform CSS plus widget placements — the first time the user visits a site; the theme is cached permanently so every later page load on that site is instant, consistent, and free. Users pick from seven built-in presets or describe their own aesthetic in a prompt box, and bring their own LLM provider key.

## Core decisions (settled during brainstorming)

| Decision | Choice |
|---|---|
| Name | **Patina** |
| Rewrite depth | Visual restyle + injected retro widgets. Page text/content untouched. |
| LLM output | **Approach A: freeform CSS** per site, plus widget placements, in a JSON envelope. All executable code ships in the extension; the model only produces data (CSS + JSON) — MV3 remote-code compliant. |
| Aesthetics | 7 presets + freeform custom aesthetics |
| Activation | Everywhere-automatic UX, implemented via `optional_host_permissions: ["<all_urls>"]` granted through an onboarding "Enable everywhere" toggle (friendlier Chrome Web Store review and install warning than required `<all_urls>`) |
| Providers | User-selectable, BYO key: Anthropic adapter + OpenAI-compatible adapter (configurable base URL) |
| Caching | Permanent per `(domain, aesthetic)`; user-driven invalidation only |
| Regeneration | One-click "Re-patinate this site" in the popup |

## Architecture

Same skeleton as ebay-cleaner (content scripts + service worker + popup + shared settings), plus an LLM layer.

### Components

- **`manifest.json`** — MV3. Required permissions: `activeTab`, `storage`. `optional_host_permissions: ["<all_urls>"]`.
- **Service worker (`background.js`)** — owns all LLM calls, the theme cache, and a per-domain generation queue (N tabs on a new domain trigger exactly one generation).
- **Content script (`content/`)** — runs at `document_start`:
  - Cache hit for `(domain, aesthetic)` → inject cached CSS immediately (no flash of un-themed page).
  - Cache miss → apply the aesthetic's bundled instant **base theme**, build a **DOM digest**, message the service worker to generate; apply (fade in) the generated theme when it arrives.
  - Hosts the **widget runtime**: marquee, sparkle cursor, tiled background, hit counter, badges/stamps, dividers. Widgets are shipped code configured by model-emitted JSON.
  - MutationObserver keeps styles and widgets asserted on SPA navigations.
- **Popup** — current-site status (themed / generating / off / denylisted), per-site on/off, **"♻️ Re-patinate this site"**, aesthetic picker.
- **Options page** — provider/model/key config; custom aesthetic editor; denylist editor; global toggle; cache viewer (per-site size, date, model used, delete).
- **Assets** — bundled textures, GIFs, and fonts per preset. The model references assets by token name; nothing loads from the network.

### DOM digest (model input)

~2–4KB per site: landmark structure (header/nav/main/aside/footer), dominant selectors and their roles, computed colors/fonts/backgrounds of major elements, page title/description. Built by the content script on cache miss.

### LLM envelope (model output)

```json
{
  "css": "/* full site-specific stylesheet */",
  "widgets": [
    {"type": "marquee", "target": "header h1", "text": null},
    {"type": "hit_counter", "position": "footer"}
  ],
  "notes": "dark site; inverted palette variant used"
}
```

Structured output (JSON schema) where the provider supports it; parse-and-validate otherwise. Request = stable system prompt (aesthetic spec + CSS-writing rules + widget catalog; `cache_control` on the Anthropic adapter) followed by the per-site DOM digest.

## Caching & lifecycle

- **Key:** `(domain, aesthetic-id)` → envelope + metadata (model, date, size) in `chrome.storage.local`. ~10–20KB per theme; thousands of sites fit in the default quota.
- **Never expires.** Invalidation is user-driven only:
  - **Re-patinate** — deletes the entry and regenerates; the prompt includes a summary of the previous theme with an instruction to take a different direction (models in scope don't accept sampling-temperature variance, so variation is prompt-driven).
  - **Switching aesthetics** — different key; switching back is instant.
  - **Manual delete** in the options cache viewer.
- **First visit:** base theme instantly → background generation (5–20s, model-dependent) → generated CSS fades in mid-session → cached forever.
- **Repeat visit:** 0ms, zero tokens.

## Providers & cost

- Two `fetch`-based adapters in the service worker:
  - **Anthropic** (Messages API) — model picker defaults to `claude-opus-5`; `claude-haiku-4-5` offered as the fast/cheap option. Prompt caching on the aesthetic spec.
  - **OpenAI-compatible** — configurable base URL; covers OpenAI, OpenRouter, Ollama, and most other providers.
- Marginal cost per site ≈ digest input + ~1–3K output tokens: order of a cent on Haiku, a few cents on Opus — one-time per `(site, aesthetic)` thanks to the permanent cache.
- Streaming used for popup progress display; CSS applies when generation completes.

## Safety & failure handling

- **CSS sanitizer** (runs before any injection):
  - Strip `@import`.
  - Strip external `url()` — CSS can exfiltrate page content to third-party hosts; only bundled-asset references and `data:` URIs pass.
  - Strip full-viewport `position: fixed` overlays (clickjacking-adjacent).
  - Size cap ~50KB.
- **Default denylist** — banking, health, and government categories; user-editable. Plus per-site off switch.
- **Failure modes:** generation error or invalid envelope → keep base theme, badge the popup, offer retry. Broken-looking cached theme → re-patinate or per-site off. No API key configured → preset base themes still work in generic mode; LLM features prompt for setup.
- **Privacy disclosure (for store listing):** DOM digests are sent to the user's configured LLM provider; API key stored locally in `chrome.storage`.

## Presets

Each preset = an aesthetic spec (prompt section) + bundled base theme CSS + asset pack + widget defaults.

| Preset | Direction |
|---|---|
| **Terminal** | Phosphor CRT: green-(or amber-)on-black, monospace everything, scanlines, blocky ASCII-style borders, blinking cursor accents. |
| **8-bit** | NES-era: pixel fonts, chunky pixelated borders and dithering, limited primary palette, sprite-style icons, pixel cursor. |
| **Information Superhighway** | The flagship early-web preset: tiled starfields, Comic Sans/Times, marquees, hit counters, "under construction" tape, beveled buttons, web-ring badges, "best viewed in Netscape". |
| **Psychedelic** | 60s–70s psychedelia: tie-dye/lava-lamp gradients, acid palette, groovy bubble type, wavy dividers, kaleidoscope patterns. |
| **Enterprise** | LCARS (Star Trek: TNG bridge computer, Okuda-style): black backgrounds; salmon/lavender/pale-blue/gold panel palette; rounded pill buttons and "elbow" swept-corner frames; thin bars with rounded end caps; ultra-condensed all-caps type, right-aligned labels with number codes; blinking status readouts and a stardate widget. |
| **Soviet** | Constructivist propaganda: red/black/cream, bold condensed type, star motifs, poster diagonals, brutalist blocks. |
| **Murica** | Maximal Americana: stars-and-stripes everywhere, eagles, red/white/blue gradients, denim texture, slab type, fireworks. |

Custom aesthetics: user text prompt → the LLM improvises the full spec, using the generic widget catalog; saved as a named aesthetic alongside presets.

## Prototype scope

- New repo `~/code/patina` (this one).
- **Information Superhighway** fully crafted (assets + base theme + tuned spec); remaining six presets shipped as thin specs (prompt + minimal base theme) to be deepened iteratively.
- Custom-aesthetic prompt box wired end to end.
- Both provider adapters working; onboarding toggle for `<all_urls>`.

## Testing

- Unit tests: CSS sanitizer (exfiltration/import/overlay cases), cache layer (keying, invalidation, quota), envelope validation.
- Manual QA loop against a fixed site list — Wikipedia (classic semantic HTML), Hacker News (table layout), a Tailwind-heavy site, an SPA (YouTube) — checking digest quality, theme quality, SPA re-assertion, and re-patinate flow.
- Popup/options flows QA'd manually, ebay-cleaner style.
