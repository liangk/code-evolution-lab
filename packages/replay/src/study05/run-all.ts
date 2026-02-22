/**
 * Study 05 — Missing Index Benchmarks
 *
 * This study requires a live PostgreSQL database with Prisma.
 * It cannot run in a self-contained Node.js process like Studies 03 and 04.
 *
 * Prerequisites:
 *   1. PostgreSQL running (e.g. via Docker: `docker compose up -d`)
 *   2. DATABASE_URL set in environment
 *   3. Run `npx prisma migrate deploy` in the study directory
 *   4. Run `npx prisma db seed` to populate bench_users / bench_orders tables
 *
 * To run Study 05 benchmarks, use the original empirical-study repo:
 *   cd empirical-study/studies/05-missing-index
 *   npm run bench:all
 *
 * Modules covered:
 *   BM-01: Point Lookup — Unindexed Column (email)
 *   BM-02: Sorted Range Query — Unindexed ORDER BY (created_at)
 *   BM-03: Foreign Key Scan — Unindexed FK column (user_id)
 *   BM-04: Composite Filter — Multi-column WHERE without composite index
 *   BM-05: Covering Index — SELECT with/without covering index
 *
 * Each module measures query latency (ms) with and without the relevant index,
 * using Welch's t-test and Cohen's d for statistical significance.
 */

console.error(
  '[study05] Study 05 requires a live PostgreSQL database.\n' +
  'See the comment at the top of this file for setup instructions.\n' +
  'Run the benchmarks from: empirical-study/studies/05-missing-index',
);
process.exit(1);
