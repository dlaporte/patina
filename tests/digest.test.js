const test = require("node:test");
const assert = require("node:assert");
const { buildDigest, isDarkColor, capDigest } = require("../content/digest.js");

function fakeEl(className) {
  const classes = className.split(/\s+/).filter(Boolean);
  return { className, classList: classes };
}

function fakeDoc() {
  const header = fakeEl("site-header sticky");
  const body = fakeEl("");
  return {
    title: "Example Site",
    body,
    querySelector(sel) {
      if (sel === "header") return header;
      if (sel === "a") return fakeEl("nav-link");
      return null; // no nav/main/aside/footer/button/h1 on this fake page
    },
    querySelectorAll(sel) {
      if (sel === "[class]") return [header, fakeEl("card"), fakeEl("card"), fakeEl("card wide")];
      return [];
    }
  };
}

const fakeWin = {
  location: { hostname: "www.example.com" },
  getComputedStyle() {
    return { getPropertyValue: (p) => ({ "background-color": "rgb(20, 20, 30)", color: "rgb(230, 230, 230)", "font-family": "Arial" }[p] || "") };
  }
};

test("isDarkColor classifies rgb colors by luminance", () => {
  assert.equal(isDarkColor("rgb(20, 20, 30)"), true);
  assert.equal(isDarkColor("rgb(250, 250, 245)"), false);
  assert.equal(isDarkColor("not-a-color"), false);
});

test("buildDigest collects title, host, landmarks, top classes, styles, dark mode", () => {
  const d = buildDigest(fakeDoc(), fakeWin);
  assert.equal(d.title, "Example Site");
  assert.equal(d.host, "www.example.com");
  assert.deepEqual(d.landmarks.header.classes, ["site-header", "sticky"]);
  assert.equal(d.landmarks.footer, undefined);
  assert.equal(d.topClasses[0].name, "card");
  assert.equal(d.topClasses[0].n, 3);
  assert.equal(d.styles.body["background-color"], "rgb(20, 20, 30)");
  assert.equal(d.darkMode, true);
});

test("capDigest trims topClasses to fit the byte budget", () => {
  const digest = {
    title: "t", host: "h", landmarks: {}, styles: {},
    topClasses: Array.from({ length: 200 }, (_, i) => ({ name: "class-number-" + i, n: 1 })),
    darkMode: false
  };
  const capped = capDigest(digest, 1024);
  assert.ok(JSON.stringify(capped).length <= 1024);
  assert.ok(capped.topClasses.length >= 5);
  assert.equal(digest.topClasses.length, 200); // input not mutated
});

test("looksMinified separates hashed class names from semantic ones", () => {
  const { looksMinified } = require("../content/digest.js");
  for (const hashed of ["x1n2onr6", "xdt5ytf", "x1yztbdb", "jsx3778", "xjbqbqwtplc"]) {
    assert.equal(looksMinified(hashed), true, hashed);
  }
  for (const semantic of ["sidebar", "card", "mt-4", "card__header", "site-header", "feedback", "container", "wrapper"]) {
    assert.equal(looksMinified(semantic), false, semantic);
  }
});

test("buildDigest flags sites whose top classes are mostly minified", () => {
  const hashedDoc = fakeDoc();
  hashedDoc.querySelectorAll = (sel) =>
    sel === "[class]" ? [fakeEl("x1n2onr6 xdt5ytf"), fakeEl("x1yztbdb x9f619"), fakeEl("x1n2onr6")] : [];
  assert.equal(buildDigest(hashedDoc, fakeWin).classesLookMinified, true);
  assert.equal(buildDigest(fakeDoc(), fakeWin).classesLookMinified, false); // semantic classes
});
