(function (root, factory) {
  const mod = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = mod;
  root.Patina = root.Patina || {};
  root.Patina.presets = mod;
})(globalThis, function () {
  const PRESETS = [
    {
      id: "superhighway",
      name: "Information Superhighway",
      spec: `The 1998–2003 personal-homepage web (GeoCities/Angelfire era).
Palette: deep space-navy page background (#000018) with the tiled starfield texture (var(--patina-asset-stars)); electric unvisited-link blue (#66ccff on dark, #0000EE on light panels), visited purple (#cc99ff), lime green (#66ff66) and hot magenta (#ff66cc) accents, yellow (#ffff66) headings.
Type: Times New Roman for body text; Comic Sans MS for headings and anything playful. Underline every link.
Chrome: content areas become boxed "table" panels — 2px ridge or outset borders (#c0c0c0), slight padding, no border-radius anywhere. Buttons and inputs get the classic gray 3D bevel: background #c0c0c0, 2px outset white border, black text. Horizontal rules become chunky.
Texture accents: use var(--patina-asset-construction) sparingly as a banner background for one prominent header or nav strip.
Energy: exuberant amateur enthusiasm. It should look hand-made with love in FrontPage.
Widgets: strongly prefer tiled_background (stars), a marquee on the page's main heading, a hit_counter, sparkle_cursor, and a badge reading "Best viewed in Netscape Navigator 4.0".`,
      baseCss: `body { background-color: #000018 !important; background-image: var(--patina-asset-stars) !important; color: #e8e8ff !important; font-family: "Times New Roman", serif !important; }
a { color: #66ccff !important; text-decoration: underline !important; }
a:visited { color: #cc99ff !important; }
h1, h2, h3 { color: #ffff66 !important; font-family: "Comic Sans MS", "Comic Sans", cursive !important; }
button, input[type="submit"], input[type="button"] { background: #c0c0c0 !important; color: #000 !important; border: 2px outset #fff !important; border-radius: 0 !important; }
input, textarea, select { border-radius: 0 !important; }`
    },
    {
      id: "terminal",
      name: "Terminal",
      spec: `A phosphor CRT terminal. Near-black background (#050805), glowing green text (#33ff33) with amber (#ffb000) reserved for headings and emphasis. Everything monospace ("Courier New", "Consolas", monospace). Borders are 1px solid green with a soft outer glow (box-shadow 0 0 6px rgba(51,255,51,.5)); no border-radius. Links are green, underlined with a dotted underline, brighter on hover. Images get a phosphor treatment: filter grayscale + sepia + hue-rotate toward green, slightly boosted contrast. Overlay the scanline texture (var(--patina-asset-scanlines)) as the body background-image. Give the first h1 a blinking block cursor via ::after content "▌". Widgets: tiled_background (scanlines); a badge reading "SYS READY".`,
      baseCss: `body { background-color: #050805 !important; background-image: var(--patina-asset-scanlines) !important; color: #33ff33 !important; font-family: "Courier New", monospace !important; }
a { color: #33ff33 !important; text-decoration: underline dotted !important; }
h1, h2, h3 { color: #ffb000 !important; font-family: "Courier New", monospace !important; text-transform: uppercase; }
button, input[type="submit"] { background: #050805 !important; color: #33ff33 !important; border: 1px solid #33ff33 !important; border-radius: 0 !important; }`
    },
    {
      id: "8bit",
      name: "8-bit",
      spec: `An NES-era video game menu. Black (#0a0a0a) background, white text, and a hard primary palette: red #e74c3c, blue #3498db, yellow #f1c40f — no gradients, no shadows with blur, no border-radius. Type: bold monospace with wide letter-spacing, ALL CAPS headings. Chunky pixel borders: 4px solid, plus stepped box-shadow offsets (e.g. box-shadow: 4px 0 0 #000, -4px 0 0 #000, 0 4px 0 #000, 0 -4px 0 #000) to fake pixel corners. Buttons look like menu items: black background, white text, and a "▶ " ::before prefix on hover/focus. Images get image-rendering: pixelated. Widgets: a badge reading "PRESS START"; hit_counter styled as a score display.`,
      baseCss: `body { background-color: #0a0a0a !important; color: #ffffff !important; font-family: "Courier New", monospace !important; letter-spacing: 0.5px; }
a { color: #f1c40f !important; text-decoration: none !important; }
h1, h2, h3 { text-transform: uppercase; color: #e74c3c !important; }
img { image-rendering: pixelated; }
button, input[type="submit"] { background: #000 !important; color: #fff !important; border: 4px solid #fff !important; border-radius: 0 !important; }`
    },
    {
      id: "psychedelic",
      name: "Psychedelic",
      spec: `Late-60s psychedelia — Fillmore poster energy. The tie-dye radial texture (var(--patina-asset-tiedye)) as body background. Palette: hot pink #ff5ecb, orange #ffb340, acid green #7bff6a, sky #5ec8ff, deep purple #4a148c for text panels. Type: rounded/bubbly display serifs ("Cooper Black", "Chalkboard SE", Georgia fallback) for headings; generous rounding everywhere (border-radius 20px+ on panels, buttons, images). Headings get a slow hue-rotate animation (@keyframes, ~12s loop) and soft multi-color text-shadow. Content panels get translucent white backgrounds (rgba(255,255,255,0.85)) so text stays readable over the tie-dye. Widgets: tiled_background (tiedye), sparkle_cursor, a marquee on the main heading.`,
      baseCss: `body { background-image: var(--patina-asset-tiedye) !important; color: #4a148c !important; }
main, article, section { background: rgba(255,255,255,0.85); border-radius: 20px; }
a { color: #ff5ecb !important; }
h1, h2, h3 { color: #4a148c !important; font-family: "Cooper Black", Georgia, serif !important; }
button, input[type="submit"] { background: #ffb340 !important; color: #4a148c !important; border: none !important; border-radius: 24px !important; }`
    },
    {
      id: "enterprise",
      name: "Enterprise",
      spec: `The LCARS bridge computer from Star Trek: The Next Generation (Okuda style). Pure black (#000) background. Panel palette: gold #ff9c00, salmon #ff9966, lavender #cc99cc, blue-lavender #9999cc, muted red #cc6666 — used as solid blocks, never gradients. Shape language: pill-shaped buttons and nav items (border-radius: 24px); sections framed with a thick colored left border (12–16px solid, alternating palette colors) and a rounded top-left "elbow" (border-top-left-radius: 40px). Thin horizontal bars with fully-rounded end caps as separators. Type: ultra-condensed sans ("Arial Narrow", "Helvetica Neue", sans-serif), ALL CAPS, right-aligned labels where feasible; decorate major headings with a ::before number code like "47-291 · ". Links are gold; hover switches to salmon. Images can keep natural color but get a 2px gold bottom border. Widgets: a badge reading "STARDATE 47291.3".`,
      baseCss: `body { background-color: #000 !important; color: #ff9c00 !important; font-family: "Arial Narrow", "Helvetica Neue", sans-serif !important; }
a { color: #ff9c00 !important; text-decoration: none !important; }
a:hover { color: #ff9966 !important; }
h1, h2, h3 { color: #cc99cc !important; text-transform: uppercase; letter-spacing: 1px; }
button, input[type="submit"] { background: #ff9966 !important; color: #000 !important; border: none !important; border-radius: 24px !important; text-transform: uppercase; }`
    },
    {
      id: "soviet",
      name: "Soviet",
      spec: `Soviet constructivist propaganda poster. Aged-paper cream background (#f2e8d5), near-black ink (#1a1a1a), and revolutionary red (#cc2222) doing all the accent work. Type: heavy condensed uppercase display ("Impact", "Haettenschweiler", "Arial Narrow", sans-serif) for headings — big, loud, tightly leaded; body text in a sturdy serif. Headings become red banners: red background, cream text, slight skew (transform: skew(-2deg)), generous horizontal padding. Thick 3px solid black borders on panels and images; no border-radius. List bullets become red stars (list-style-type: "★ "). Links: dark red (#992222), underlined, bold. Diagonal energy where possible (skewed banners, bold horizontal rules). Widgets: a badge reading "ГОТОВО (READY)"; a marquee on the main heading.`,
      baseCss: `body { background-color: #f2e8d5 !important; color: #1a1a1a !important; }
a { color: #992222 !important; font-weight: bold !important; }
h1, h2, h3 { background: #cc2222; color: #f2e8d5 !important; font-family: Impact, "Arial Narrow", sans-serif !important; text-transform: uppercase; display: inline-block; padding: 2px 12px; transform: skew(-2deg); }
ul { list-style-type: "★ "; }
button, input[type="submit"] { background: #cc2222 !important; color: #f2e8d5 !important; border: 3px solid #1a1a1a !important; border-radius: 0 !important; text-transform: uppercase; }`
    },
    {
      id: "murica",
      name: "Murica",
      spec: `Maximal county-fair Americana. Palette: old-glory red #b22234, white, and navy #3c3b6e — and use all three constantly. Body background: subtle red-and-white awning stripes via repeating-linear-gradient (white dominant so content stays readable); content panels solid white with a 3px navy border. Headings: huge slab/display type (Impact or "Arial Black"), navy fill with a red text-shadow offset (text-shadow: 3px 3px 0 #b22234), stars "★" flanking the main h1 via ::before/::after. Links bold navy; buttons red with white text and a navy border. List bullets are stars. Sprinkle small waving-flag energy: skewed red/white striped accents on hr elements. Widgets: a badge reading "FREEDOM CERTIFIED ★"; a marquee on the main heading; sparkle_cursor.`,
      baseCss: `body { background-image: repeating-linear-gradient(90deg, #ffffff 0 48px, #f6e6e8 48px 96px) !important; color: #1a1a2e !important; }
main, article, section { background: #ffffff; border: 3px solid #3c3b6e; }
a { color: #3c3b6e !important; font-weight: bold !important; }
h1, h2, h3 { color: #3c3b6e !important; font-family: Impact, "Arial Black", sans-serif !important; text-shadow: 2px 2px 0 #b22234; }
ul { list-style-type: "★ "; }
button, input[type="submit"] { background: #b22234 !important; color: #fff !important; border: 2px solid #3c3b6e !important; text-transform: uppercase; }`
    }
  ];

  function getAesthetic(id, settings) {
    const preset = PRESETS.find((p) => p.id === id);
    if (preset) return preset;
    const custom = ((settings && settings.customAesthetics) || []).find((c) => c.id === id);
    if (custom) return { id: custom.id, name: custom.name, spec: custom.spec, baseCss: "" };
    return null;
  }

  return { PRESETS, getAesthetic };
});
