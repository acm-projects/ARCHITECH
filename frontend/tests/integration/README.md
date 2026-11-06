# API integration tests

The real API routes, in a real Next.js server, against a real PostgreSQL **test** database and
a fake GitHub (nothing is sent to github.com).

```bash
createdb architech_test          # once
TEST_DATABASE_URL="postgresql://$(whoami)@localhost:5432/architech_test" npm run test:integration
```

- The test database is **wiped and rebuilt** from `prisma/migrations` (then seeded) on every run,
  so it must be separate from your dev database; its name has to contain `test`.
- Without `TEST_DATABASE_URL` the suite is skipped, so `npm test` and CI without a database are unaffected.
- The app runs on a random port with its own build folder (`.next-integration`, gitignored), so it
  does not clash with a dev server you already have running.
- Also times saving, loading and listing the largest allowed project (500 components, 2,000
  connections). Engine-side budgets are in tests/performance.test.ts (part of `npm test`).
- Covered: registration, the profile's experience level, projects (create, replace, list, read,
  delete, ownership, validation, technologies and custom technologies), GitHub repos (not connected,
  expired token refreshed, rejected refresh) and GitHub import (success, unknown repo, nothing
  recognizable, rejected token).
