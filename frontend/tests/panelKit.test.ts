import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

const PANELS = [
  "src/components/workspace/LiveMetricsBar.tsx",
  "src/components/workspace/RunPanel.tsx",
  "src/components/workspace/RunResults.tsx",
  "src/components/workspace/StressTestPanel.tsx",
  "src/components/workspace/DesignCheck.tsx",
  "src/components/workspace/ComponentInspector.tsx",
  "src/components/workspace/DesignComparisonTable.tsx",
  "src/components/workspace/history/HistoryPanel.tsx",
  "src/components/workspace/ai/ArchitectPanel.tsx",
  "src/components/challenge/ChallengeCard.tsx",
  "src/components/challenge/ChallengeLeaderboard.tsx",
];

test("right panels are built from the panel kit, with no layout of their own", () => {
  for (const path of PANELS.filter((panel) => !panel.endsWith("DesignComparisonTable.tsx"))) {
    assert.match(read(path), /panel\/Panel"/, `${path} uses the kit`);
  }
  for (const path of PANELS) {
    // DesignCheck.tsx also holds the marks on the canvas, which are positioned inline.
    const source = read(path).split("---- The panel ----").at(-1) ?? "";
    assert.doesNotMatch(source, /<details|<dl\b/, `${path} opens detail through PanelDetail and lists through rows`);
    assert.doesNotMatch(source, /style=\{\{/, `${path} sets no inline styles`);
    // design-check.css styles the marks on the canvas, not the panel.
    assert.doesNotMatch(source, /import "\.\/(?!design-check)[^"]+\.css"/, `${path} brings no stylesheet of its own`);
  }
});

test("panels keep to four text styles", () => {
  const styles = new Set(read("src/components/workspace/panel/panel.css").match(/\bfont: \d{3} [^;]+;/g));
  assert.deepEqual([...styles].sort(), [
    "font: 400 12px/18px var(--font-sans);",
    "font: 400 14px/20px var(--font-sans);",
    "font: 500 14px/20px var(--font-sans);",
    "font: 600 15px/20px var(--font-sans);",
  ]);
});
