import assert from "node:assert/strict";
import test from "node:test";
import { COMPONENT_CATALOG, FAMILY_COLORS } from "../src/components/workspace/componentCatalog.ts";
import { previewNodeColor } from "../src/components/projects/previewColors.ts";

test("preview colors match the canvas family for every component type", () => {
  for (const component of Object.values(COMPONENT_CATALOG)) {
    assert.equal(previewNodeColor(component.type), FAMILY_COLORS[component.family], component.type);
  }
});

test("unknown and inherited property names read as general", () => {
  for (const type of ["", "toString", "constructor", "__proto__"]) {
    assert.equal(previewNodeColor(type), FAMILY_COLORS.general);
  }
});

test("preview colors do not alter the workbench catalog", () => {
  const before = JSON.stringify(COMPONENT_CATALOG);
  for (const component of Object.values(COMPONENT_CATALOG)) previewNodeColor(component.type);
  assert.equal(JSON.stringify(COMPONENT_CATALOG), before);
});
