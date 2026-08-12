(function (root, factory) {
  const mod = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = mod;
  root.Patina = root.Patina || {};
  root.Patina.envelope = mod;
})(globalThis, function () {
  const WIDGET_TYPES = ["badge", "hit_counter", "marquee", "sparkle_cursor", "tiled_background"];

  function validateEnvelope(obj) {
    if (!obj || typeof obj !== "object") return { ok: false, errors: ["envelope must be an object"] };
    const errors = [];
    if (typeof obj.css !== "string" || obj.css.trim() === "") errors.push("css must be a non-empty string");
    if (!Array.isArray(obj.widgets)) {
      errors.push("widgets must be an array");
    } else {
      obj.widgets.forEach((w, i) => {
        if (!w || typeof w !== "object") { errors.push(`widgets[${i}] must be an object`); return; }
        if (!WIDGET_TYPES.includes(w.type)) errors.push(`widgets[${i}].type "${w.type}" is not a known widget`);
        for (const f of ["target", "asset", "text"]) {
          if (w[f] != null && typeof w[f] !== "string") errors.push(`widgets[${i}].${f} must be a string`);
        }
      });
    }
    if (obj.notes != null && typeof obj.notes !== "string") errors.push("notes must be a string");
    return { ok: errors.length === 0, errors };
  }

  return { WIDGET_TYPES, validateEnvelope };
});
