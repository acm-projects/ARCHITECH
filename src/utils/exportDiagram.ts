export type DiagramExportFormat = "SVG" | "PNG" | "JSON";

const EXPORT_NODES = ["Client", "API Gateway", "Service", "Queue", "Database"] as const;

function saveBlob(blob: Blob, extension: string): void {
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);

  link.href = url;
  link.download = `architech-diagram.${extension}`;
  link.click();

  URL.revokeObjectURL(url);
}

function createSvgDiagram(): string {
  const nodes = EXPORT_NODES.map(
    (name, index) =>
      `<rect x="${80 + index * 210}" y="${180 + (index % 2) * 150}" width="150" height="70" rx="12" fill="white" stroke="#7055c8"/>` +
      `<text x="${100 + index * 210}" y="${220 + (index % 2) * 150}">${name}</text>`,
  ).join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="720"><rect width="100%" height="100%" fill="#fbfaf8"/><g font-family="Arial" font-size="18" fill="#17151d">${nodes}</g></svg>`;
}

function exportPng(): void {
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 720;

  const context = canvas.getContext("2d");
  if (!context) return;

  context.fillStyle = "#fbfaf8";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#17151d";
  context.font = "28px sans-serif";
  context.fillText("ARCHITEch · E-commerce Checkout", 60, 70);

  EXPORT_NODES.forEach((name, index) => {
    context.strokeStyle = "#7055c8";
    context.strokeRect(70 + index * 210, 230 + (index % 2) * 140, 150, 70);
    context.font = "16px sans-serif";
    context.fillText(name, 88 + index * 210, 270 + (index % 2) * 140);
  });

  canvas.toBlob((blob) => {
    if (blob) saveBlob(blob, "png");
  }, "image/png");
}

export function downloadDiagram(format: DiagramExportFormat): void {
  if (format === "JSON") {
    const payload = {
      project: "E-commerce Checkout",
      nodes: EXPORT_NODES,
    };

    saveBlob(
      new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }),
      "json",
    );
    return;
  }

  if (format === "SVG") {
    saveBlob(new Blob([createSvgDiagram()], { type: "image/svg+xml" }), "svg");
    return;
  }

  exportPng();
}
