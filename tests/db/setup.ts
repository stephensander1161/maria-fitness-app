import { dropStaleAccounts } from "./account";

/**
 * Runs once before the database suite.
 *
 * Two jobs. It refuses to run at all without a `DATABASE_URL`, rather than
 * letting a hundred files fail one connection error at a time — and it sweeps
 * any account a killed run left behind, so a Ctrl-C in the middle of a file
 * does not poison the next run.
 */
export async function setup() {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "The database suite needs DATABASE_URL. Run it as `npm run test:db`, which loads .env — " +
      "or use `npm test` for the pure suite, which needs nothing.",
    );
  }
  const swept = await dropStaleAccounts();
  if (swept > 0) console.log(`  swept ${swept} account(s) left by an earlier run`);
}
