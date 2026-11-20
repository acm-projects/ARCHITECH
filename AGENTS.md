# ARCHITECH product and interface rules

ARCHITECH is a systems-design workbench. It should look and behave like a purpose-built engineering tool, not a generic SaaS template or an AI chat product.

## Product identity

- The architecture canvas is the product. Prefer topology, metrics, connections, constraints, failure paths, and system state over decorative marketing UI.
- Use real system-design terminology. Avoid generic startup copy, motivational copy, fake intelligence claims, or text that explains obvious controls.
- AI-assisted behavior may exist internally, but the interface should present concrete review, inspection, simulation, and verification actions tied to actual canvas state.
- Do not add a chatbot surface unless conversational interaction is essential to the task.

## Visual language

- Primary palette: black, white, and neutral grays.
- Use color only when it carries stable semantic information that cannot be communicated as clearly by text, shape, or contrast.
- No decorative gradients, neon glow, glassmorphism, aurora backgrounds, blobs, or soft "AI" lighting.
- Default corner radius is 0–3px. Do not round every surface.
- Avoid decorative drop shadows. Prefer borders, separators, inset state, and hierarchy.
- Prefer rows, tables, rails, inspectors, and split panes over repeated card grids.
- A card is appropriate only when the object is genuinely independent and benefits from containment.
- Do not use badges merely to make a layout feel populated. Status labels must communicate real state.
- Avoid symmetrical "hero + three features + CTA" composition. Layout should follow the task.
- Do not use generic bento grids as decoration.
- Use whitespace to separate tasks, not to make screens look premium or sparse.
- Keep controls compact. ARCHITECH should tolerate high information density.

## Typography and copy

- Use native, readable interface typography. Technical metadata may use a monospace stack.
- Do not rely on trendy display fonts to create identity.
- Avoid eyebrow text above every heading.
- Avoid all-caps labels unless they function as technical metadata, status, or a compact panel label.
- Headings should name the task or object directly.
- Helper text is allowed only when the user could reasonably make the wrong decision without it.
- Prefer "Run 2× traffic test" over "See what happens when your system comes alive."
- Prefer "System review" over "AI Architect."
- Prefer "API · 02 saturation" over "We found a potential bottleneck!"

## Motion

- Motion must represent state: traffic flow, simulation progress, topology changes, focus, opening/closing, or direct manipulation.
- Do not add scroll-reveal animation, floating decoration, looping shimmer, parallax, hover lift, or motion only to make a screen feel modern.
- Respect reduced-motion settings.

## Interaction

- Hover, focus, selected, disabled, loading, success, and destructive states must be explicit.
- Selection should be visible without relying only on color.
- Prefer native-feeling controls and predictable keyboard behavior.
- Mobile layouts must intentionally reflow; do not merely shrink the desktop canvas or card grid.
- Destructive operations require confirmation when data cannot be trivially restored.

## Engineering discipline

AI assistance is not permission to "accept all."

- Preserve existing behavior unless the requested change intentionally alters it.
- Read the affected component and its state/data flow before editing.
- Keep business logic out of decorative UI components.
- Prefer small, named helpers and typed data over duplicated inline logic.
- Do not add placeholder authentication, secret values, exposed tokens, or fake production integrations.
- Validate user-controlled values before they reach persistence, URLs, exports, or external services.
- Do not silently swallow errors.
- Every repository change must pass unit tests, TypeScript checking, and the production build.
- Batch related edits into one commit and one push. Do not create a separate commit for each file or micro-change.
- When local tooling is available, run `npm run check` before pushing. GitHub Actions is the verification gate, not the iteration loop.
- Do not manually rerun CI for a commit that has already been superseded by a newer push.
- For stateful flows, verify save/reload/reopen behavior and relevant edge cases.
- Browser-test interaction-heavy changes when browser access is available.
- Do not claim a browser test happened when only static checks ran.

## Anti-regression check

Before shipping a UI change, ask:

1. Does this look like ARCHITECH specifically, or could it belong to any AI SaaS?
2. Is this surface necessary, or is it another card around existing content?
3. Is the copy telling the user something useful, or narrating the interface?
4. Is motion communicating system state, or decorating the page?
5. Is color semantic, or decorative?
6. Did we make the engineering information easier to scan?
7. Would an experienced systems engineer recognize the terminology and workflow?
