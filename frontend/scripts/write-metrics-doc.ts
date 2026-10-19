import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { renderMetricsDoc } from "../src/lib/architecture/evaluation/metricsDoc.ts";

// npm run docs:metrics: regenerates docs/metrics-model.md (repository root) from the engine.
const target = fileURLToPath(new URL("../../docs/metrics-model.md", import.meta.url));
writeFileSync(target, renderMetricsDoc());
console.log(`Wrote ${target}`);
