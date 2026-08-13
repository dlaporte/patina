(function (root, factory) {
  const mod = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = mod;
  root.Patina = root.Patina || {};
  root.Patina.prompt = mod;
})(globalThis, function () {
  const WIDGET_CATALOG = `Available widgets (shipped with the extension; you only emit placements):
- marquee: {"type":"marquee","target":"<css selector>"} — scrolls the target's text horizontally.
- sparkle_cursor: {"type":"sparkle_cursor"} — trailing sparkles follow the mouse.
- tiled_background: {"type":"tiled_background","asset":"stars|construction|scanlines|tiedye"} — tiles a bundled texture on the page background.
- hit_counter: {"type":"hit_counter"} — retro odometer-style visit counter pinned near the bottom of the page.
- badge: {"type":"badge","text":"<short text>"} — small retro badge pinned near the bottom of the page.`;

  const CSS_RULES = `Rules for the "css" field:
- Style ONLY selectors present in the DOM digest, plus base elements (body, a, h1-h3, p, input, button, img).
- Never use @import. Never reference external URLs. url() is allowed only for data: URIs.
- For texture backgrounds use these CSS variables as background-image values: var(--patina-asset-stars), var(--patina-asset-construction), var(--patina-asset-scanlines), var(--patina-asset-tiedye).
- Do not hide or remove content (no display:none on content containers). Do not create full-viewport fixed overlays.
- Keep the page usable: readable contrast, visible focus states, working hover states.
- CONTRAST PAIRING (critical): whenever you change an element's background, you MUST also force a readable text color onto ALL text that sits on that background — including nested spans, divs, and labels that carry their own color classes. Modern sites set text color on deep descendants, so pair every recolored background with a broad descendant color rule (e.g. body with a dark background needs "body :not(a):not(button) { color: <light> !important }" or equivalent regional rules). Never leave a site's original text color over a background you replaced.
- If the digest reports classesLookMinified: the site's class names are machine-generated hashes. Do NOT reference any digest class names in selectors. Style only semantic elements and landmarks (body, header, nav, main, aside, footer, article, section, h1-h6, p, a, button, input, img, [role] attributes).
- For dense application UIs (feeds, chat panes, toolbars — many landmarks and thousands of elements): prefer recoloring (backgrounds, text, links, subtle borders) over structural decoration. Apply panel borders, bevels, skews, and other shape treatments only to elements you can identify semantically — never to generic divs or spans, which produces empty decorated boxes.
- Prefer specific selectors; !important is acceptable to beat utility-class frameworks.
- Keep total CSS under 40KB.
Respond with a single JSON object and nothing else: {"css": "...", "widgets": [...], "notes": "<one-line summary of the direction you took>"}.`;

  function buildSystemPrompt(aesthetic) {
    return [
      "You are Patina, a web restyling engine. Given a DOM digest of a website, you produce a site-specific theme that reskins it into a target aesthetic without breaking usability.",
      "## Target aesthetic: " + aesthetic.name,
      aesthetic.spec,
      "## Widget catalog",
      WIDGET_CATALOG,
      "## Output contract",
      CSS_RULES
    ].join("\n\n");
  }

  function buildUserMessage(digest, opts = {}) {
    const parts = ["DOM digest of the site to theme:", JSON.stringify(digest)];
    if (opts.previousNotes) {
      parts.push(
        `The user rejected the previous theme for this site (its summary: "${opts.previousNotes}"). Take a noticeably different direction this time while staying inside the aesthetic.`
      );
    }
    return parts.join("\n\n");
  }

  const ENVELOPE_SCHEMA = {
    type: "object",
    properties: {
      css: { type: "string" },
      widgets: {
        type: "array",
        items: {
          type: "object",
          properties: {
            type: { type: "string", enum: ["marquee", "sparkle_cursor", "tiled_background", "hit_counter", "badge"] },
            target: { type: "string" },
            asset: { type: "string" },
            text: { type: "string" }
          },
          required: ["type"],
          additionalProperties: false
        }
      },
      notes: { type: "string" }
    },
    required: ["css", "widgets"],
    additionalProperties: false
  };

  return { WIDGET_CATALOG, CSS_RULES, buildSystemPrompt, buildUserMessage, ENVELOPE_SCHEMA };
});
