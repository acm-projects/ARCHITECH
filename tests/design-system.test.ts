import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const routeLayers = [
  "src/styles/interface.css",
  "src/styles/workspace.css",
  "src/styles/architecture.css",
];

test("presentation CSS stays inside the four-layer design system", () => {
  const index = readFileSync("src/index.css", "utf8").trim();
  assert.equal(
    index,
    [
      '@import "./styles/system.css";',
      '@import "./styles/interface.css";',
      '@import "./styles/workspace.css";',
      '@import "./styles/architecture.css";',
    ].join("\n"),
  );
});

test("route layers use shared tokens instead of legacy presentation literals", () => {
  for (const path of routeLayers) {
    const css = readFileSync(path, "utf8");
    assert.doesNotMatch(css, /!important/, `${path} reintroduced !important`);
    assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}\b/, `${path} introduced a raw hex color`);
    assert.doesNotMatch(
      css,
      /ui-monospace|SFMono-Regular|\bMenlo\b|\bConsolas\b|\bInter\b/,
      `${path} introduced a one-off font stack`,
    );
    assert.doesNotMatch(
      css,
      /border-radius:\s*(?:2|3)px/,
      `${path} introduced a literal control or panel radius`,
    );
  }
});
