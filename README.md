# Patina

Restyles the web to match your aesthetic. Pick a patina — Terminal, 8-bit,
Information Superhighway, Psychedelic, Enterprise (LCARS), Soviet, Murica, or
one you invent — and every site gets the finish.

An LLM generates a site-specific theme (CSS + retro widget placements) the
first time you visit a site; Patina caches it permanently, so every later
visit is instant, consistent, and free. Don't like the result? One click
re-patinates the site in a different direction.

## Install (developer mode)

1. `chrome://extensions` → enable Developer mode → Load unpacked → this folder.
2. Open Patina's Options: pick a provider (Anthropic or any OpenAI-compatible
   endpoint), paste your API key, choose a model.
3. Toggle "Enable everywhere" (or use the popup's "Patinate this page" per site).

## How it works

- Content scripts apply cached themes at document_start; a service worker owns
  LLM calls, validation, CSS sanitization, and the per-(site, aesthetic) cache.
- The LLM only ever produces data (CSS + widget JSON). All executable code
  ships in this package (MV3 remote-code compliant).
- Generated CSS is sanitized before it ever touches a page: no @import, no
  external url() (data: URIs only), no full-viewport fixed overlays, 50KB cap.

## Privacy

- Your API key is stored locally (`chrome.storage.local`) and sent only to the
  provider you configured.
- On first visit to a site, a small structural digest of the page (landmark
  tags, common class names, a few computed colors/fonts, page title) is sent
  to your configured LLM provider to generate the theme. Page text and form
  content are never included.
- Banking/health/government sites are denylisted by default (editable).

## Development

- No build step. Tests: `npm test` (Node ≥ 18.13, uses `node --test`).
- Spec: `docs/superpowers/specs/2026-08-12-patina-design.md`
- QA: `docs/qa-checklist.md`
