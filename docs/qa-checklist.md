# Patina QA Checklist

Run after any significant change. Prereqs: unpacked install, Anthropic key configured, "Enable everywhere" ON unless a step says otherwise.

## Test sites
- https://en.wikipedia.org — classic semantic HTML
- https://news.ycombinator.com — table layout
- https://tailwindcss.com — utility-class CSS
- https://www.youtube.com — SPA navigation

## First-visit flow
- [ ] New domain: "Patinating…" curtain appears immediately, styled to the current patina
- [ ] "Show the page now" lifts the curtain early; it also self-lifts after ~15s if generation is slow
- [ ] With the curtain disabled in Options: base theme appears immediately (no flash of the original site)
- [ ] Generated theme + widgets apply within ~30s without reload
- [ ] Service-worker console shows no errors

## Cache behavior
- [ ] Reload: full theme applies instantly; no LLM network request
- [ ] Second page on same domain: instant, no generation
- [ ] Switching patina and back: both directions instant after first generation each

## Apply / Re-apply
- [ ] Choosing a patina in the picker changes nothing until "Apply Patina" is clicked
- [ ] Apply Patina: cached patina applies instantly; a new one generates (curtain shows)
- [ ] Regeneration: popup ↻ regenerates the current patina, overwriting the cached theme without a reload
- [ ] Cache viewer shows updated generation date

## Controls
- [ ] Per-site disable → reload un-themed; re-enable restores cached theme
- [ ] Power switch in the popup nameplate off → nothing themes anywhere
- [ ] Denylist: add a test domain → un-themed + popup says denylisted; *.gov never themes
- [ ] No API key: base themes still apply; popup says "No API key — open Options"

## On-demand mode
- [ ] Options → "Enable everywhere" OFF → new sites load un-themed
- [ ] Popup → Apply Patina themes the current tab only
- [ ] Applying a different patina to an already-themed tab swaps it (old widgets/styles swept)

## SPA behavior (YouTube)
- [ ] Theme survives in-app navigation (style element re-asserted)

## Custom patinas
- [ ] Create one via options; select in popup; site generates and caches under it

## Sanitizer spot-check
- [ ] Options cache viewer: inspect a cached entry via service-worker console
      (`Patina.cache.listThemes().then(console.log)`) — css contains no `@import` and no non-`data:` `url(`
