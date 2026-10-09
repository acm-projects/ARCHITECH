// A compact preview that matches the canvas node (same size, radius, glyph and name),
// used instead of the browser's default drag ghost. Inline styles only: the element
// lives on <body>, outside the workspace's scoped stylesheet.
const PREVIEW_WIDTH = 144;
const PREVIEW_HEIGHT = 42;

export function setComponentDragImage(
  dataTransfer: DataTransfer,
  name: string,
  glyph: SVGElement | null,
  color: string,
) {
  const preview = document.createElement("div");
  Object.assign(preview.style, {
    position: "fixed",
    top: "-1000px",
    left: "-1000px",
    boxSizing: "border-box",
    display: "flex",
    alignItems: "center",
    gap: "8px",
    width: `${PREVIEW_WIDTH}px`,
    height: `${PREVIEW_HEIGHT}px`,
    padding: "0 11px",
    border: "1px solid #d2d2ce",
    borderRadius: "10px",
    background: "#ffffff",
    boxShadow: "0 1px 3px rgba(10, 10, 10, 0.14)",
    color: "#0a0a0a",
    fontFamily: "inherit",
    pointerEvents: "none",
  });

  if (glyph) {
    const icon = glyph.cloneNode(true) as SVGElement;
    icon.setAttribute("width", "16");
    icon.setAttribute("height", "16");
    icon.style.color = color;
    icon.style.flex = "none";
    preview.appendChild(icon);
  }

  const title = document.createElement("span");
  title.textContent = name;
  Object.assign(title.style, {
    fontSize: "13px",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  });
  preview.appendChild(title);

  document.body.appendChild(preview);
  dataTransfer.setDragImage(preview, PREVIEW_WIDTH / 2, PREVIEW_HEIGHT / 2);

  // The browser snapshots the element synchronously, so it can go away right after.
  setTimeout(() => preview.remove(), 0);
}
