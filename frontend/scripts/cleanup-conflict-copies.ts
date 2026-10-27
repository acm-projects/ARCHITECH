import pg from "pg";

// npm run cleanup:conflict-copies [-- --delete]
// Removes the "<title> (from another device)" projects that the earlier conflict handling
// created (it now keeps the other version in the project's history instead). Lists them first;
// deletes only with --delete. Their versions and saved conversations are deleted with them.
// Browsers drop their local copies on the next page load (the server no longer has them).

const SUFFIX = " (from another device)";
const apply = process.argv.includes("--delete");
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set (run from frontend/ so .env is read).");
  process.exit(2);
}

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  const { rows } = await client.query<{ id: string; title: string; email: string | null; created_at: Date }>(
    `SELECT p.id, p.title, u.email, p.created_at
       FROM projects p JOIN users u ON u.id = p.user_id
      WHERE p.title LIKE $1
      ORDER BY u.email, p.created_at`,
    [`%${SUFFIX}`],
  );
  if (rows.length === 0) {
    console.log("No conflict copies found. Nothing to do.");
  } else {
    const byTitle = new Map<string, number>();
    for (const row of rows) {
      const base = row.title.split(SUFFIX)[0];
      const key = `${row.email ?? "?"}  "${base}"`;
      byTitle.set(key, (byTitle.get(key) ?? 0) + 1);
    }
    console.log(`${rows.length} conflict cop${rows.length === 1 ? "y" : "ies"}:`);
    for (const [key, count] of byTitle) console.log(`  ${count} × ${key}`);
    if (apply) {
      const { rowCount } = await client.query("DELETE FROM projects WHERE id = ANY($1::text[])", [rows.map((row) => row.id)]);
      console.log(`\nDeleted ${rowCount}. Reload the app so your browser drops its local copies.`);
    } else {
      console.log("\nNothing was deleted. Run again with -- --delete to remove them.");
    }
  }
} finally {
  await client.end();
}
