import assert from "node:assert/strict";
import test from "node:test";
import { COMPONENT_CATALOG } from "../src/components/workspace/componentCatalog.ts";
import { previewNodeColor } from "../src/components/projects/previewColors.ts";

test("preview colors follow the catalog family for every component type", () => {
  const expected = {
    frontend: "#155DFC",
    backend: "#DC2626",
    data: "#16A34A",
    infrastructure: "#737373",
    general: "#EAB308",
  };
  for (const component of Object.values(COMPONENT_CATALOG)) {
    assert.equal(previewNodeColor(component.type), expected[component.family], component.type);
  }
});

test("unknown and inherited property names use the yellow fallback", () => {
  for (const type of ["", "custom", "toString", "constructor", "__proto__"]) {
    assert.equal(previewNodeColor(type), "#EAB308");
  }
});

test("preview colors do not alter the workbench catalog", () => {
  const before = JSON.stringify(COMPONENT_CATALOG);
  for (const component of Object.values(COMPONENT_CATALOG)) previewNodeColor(component.type);
  assert.equal(JSON.stringify(COMPONENT_CATALOG), before);
});
