import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync("export-templates/runnable-app/web/index.html", "utf8");

test("the run page leads back to the design inside ARCHITECH, and stays standalone in Docker", () => {
  // Only the ARCHITECH-served page has an app base under /api/projects/<id>/run.
  assert.match(page, /BASE\.match\(\/\^\\\/api\\\/projects\\\/\(\[\^\/\]\+\)\\\/run\$\/\)/);
  assert.match(page, /\$\("back"\)\.href = `\/workspace\/\$\{project\}`/);
  assert.match(page, /<a class="brand" id="brand" href="\/dashboard" hidden>/);
});

test("requests are a list to pick from, with each step's timing", () => {
  assert.match(page, /<ol class="requests" id="history"/);
  assert.doesNotMatch(page, /<select id="history"/);
  assert.match(page, /function pick\(index\)/);
  assert.match(page, /Step \$\{index \+ 1\} of \$\{steps\.length\}/);
});

test("items are edited in place, and errors show beside the list instead of in dialogs", () => {
  assert.match(page, /form\[data-edit\]/);
  assert.doesNotMatch(page, /prompt\(/);
  assert.doesNotMatch(page, /alert\(/);
  // Deleting still asks first: it cannot be undone.
  assert.match(page, /confirm\(`Delete/);
});
