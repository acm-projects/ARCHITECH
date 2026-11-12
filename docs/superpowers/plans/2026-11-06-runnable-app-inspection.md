# Runnable app inspection and editing implementation plan

> **For agentic workers:** Use superpowers:executing-plans to implement these tasks inline.

**Goal:** Add the four improvements authorized in chat: resizable split, node inspection, request summaries, and inline edits.
**Architecture:** Extend the shared standalone HTML template used by both exported apps and the in-project run route. Keep API routes and persistence contracts unchanged. Test stateful behavior through the existing Node test runner and VM harness.
**Tech stack:** HTML, CSS, browser JavaScript; Node TypeScript tests.
**Spec:** The four suggestions accepted by the user in this conversation.

## Constraints and review focus
- Preserve existing uncommitted styling and diagram work.
- Pointer and keyboard resizing; validate stored widths; stack panes on mobile.
- Escape user content. Use measured timing only; distinguish absent trace data.
- Node selection must have a visible outline, keyboard activation, and accurate request state.
- Failed edits retain drafts. Polling must preserve draft values and focus. Save validates title/body limits and prevents duplicate submissions.
- Run unit tests, TypeScript checks, production build. Browser-test if a browser is available; report limitations accurately.

## Tasks
1. Add failing interaction tests for split width restoration/clamping, trace timing and summaries, node inspection, inline save/cancel/failure/draft retention.
2. Implement resize state and pointer/keyboard events in `frontend/export-templates/runnable-app/web/index.html`.
3. Add accessible node selection and compact inspection details; record request duration and render a summary for the displayed trace.
4. Replace prompt editing with named draft/render/save/cancel helpers and inline validation/errors; preserve drafts/focus across list refreshes.
5. Run focused and full verification, review the final diff, and report any existing check failures. Keep the work uncommitted unless asked to commit.

## Completion evidence
- Implemented all four tasks in the shared template, preserving existing draft and diagram work.
- Focused tests: 19 passed, including save/reload, stale response rejection, polling draft/selection retention, failed-save focus recovery, and API duration recording.
- Full suite: 1,039 passed; 2 existing failures (route design-token assertion and missing `python3` for ZIP verification).
- TypeScript checking and production build passed; full page JavaScript syntax and whitespace checks passed.
- Read-only review completed; reported focus issues fixed and regression-tested. Browser inventory had no connected surfaces, so no browser test was performed.
