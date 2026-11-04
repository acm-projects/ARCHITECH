// A compact preview in the canvas node's style (square corners, glyph and name, no shadow),
// used instead of the browser's default drag ghost. Inline styles only: the element lives on
// <body>, outside the workspace's scoped stylesheet, so its colors are read from the
// workspace's theme tokens at drag start (dark mode included).
const PREVIEW_WIDTH = 112;
const PREVIEW_HEIGHT = 30;

function workspaceToken(name: string, fallback: string): string {
  const workspace = document.querySelector(".ax-workspace");
  const value = workspace ? getComputedStyle(workspace).getPropertyValue(name).trim() : "";
  return value || fallback;
}

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
    gap: "6px",
    width: `${PREVIEW_WIDTH}px`,
    height: `${PREVIEW_HEIGHT}px`,
    padding: "0 8px",
    border: `1px solid ${workspaceToken("--ax-line-strong", "#d3d3ce")}`,
    borderRadius: "2px",
    background: workspaceToken("--ax-surface", "#ffffff"),
    color: workspaceToken("--ax-ink", "#111111"),
    fontFamily: "inherit",
    pointerEvents: "none",
  });

  if (glyph) {
    const icon = glyph.cloneNode(true) as SVGElement;
    icon.setAttribute("width", "14");
    icon.setAttribute("height", "14");
    icon.style.color = color;
    icon.style.flex = "none";
    preview.appendChild(icon);
  }

  const title = document.createElement("span");
  title.textContent = name;
  Object.assign(title.style, {
    fontSize: "11px",
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
