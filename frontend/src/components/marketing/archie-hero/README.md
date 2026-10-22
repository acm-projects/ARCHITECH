# Archie hero

`ArchieHero.tsx` is the public component. Marketing supplies its existing signup
and demo actions; authentication, navigation and project state stay in the host.
It is rendered within the entry flow client boundary.

- `heroModel.ts`: asset-free timeline, geometry and recording layout.
- `heroDiagram.ts`: bound diagram DOM painter; owns no clock.
- `heroCharacter.ts`: source-frame tracing and canvas composition.
- `useHeroPlayback.ts`: shared media clock, frame callbacks and lifecycle cleanup.
- `archie-hero.css`: feature styles and local label font.
- `assets/`: approved frame geometry and font.

The unchanged source video and poster are served from `public/archie-hero/`.
The recording stays at native 12 fps. Character ink follows presented video
frames; the diagram and headline interpolate from the same media clock.

Ported from ACM Playground commit `c5f4058`. The original extraction and manual
pixel-review tools remain there. The host suite retains the approved 110-frame
character and eye fixtures, timeline tests and diagram output snapshots.
Run `npm run check` from `frontend` before committing changes. Do not regenerate
visual fixtures to accommodate a refactor.
