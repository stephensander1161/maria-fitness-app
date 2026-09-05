/**
 * Whose requests may drive an unattended change.
 *
 * The daily routine reads the `feedback` table, writes code from what it finds,
 * and deploys. That makes a row in that table an input to a process with commit
 * rights — so the question "who wrote this row" stops being a nicety and
 * becomes the last gate before production.
 *
 * The app is invite-only, so in practice every account is already trusted. This
 * is the second lock: if an account is ever added by mistake, or an existing one
 * is taken over, whatever they file is still read by a human before any of it
 * becomes code. The routine ignores rows from anyone not named here, and says
 * how many it ignored rather than dropping them quietly.
 *
 * Deliberately a hard-coded list rather than a role or a database flag. A role
 * can be granted by something that goes wrong; this list changes only in a
 * commit, which is the property that makes it a gate at all.
 */
export const REQUEST_AUTHORS: readonly string[] = [
  "stephen.sander1@gmail.com",
  "maria.alicia.sander@gmail.com",
  "sanderg1@telus.net",
] as const;

/** Case and whitespace are normalised the same way sign-in normalises them. */
export const mayDriveChanges = (email: string | null | undefined): boolean =>
  typeof email === "string" && REQUEST_AUTHORS.includes(email.trim().toLowerCase());

/**
 * Split what the table returned into what an agent may act on and what a human
 * has to read first.
 *
 * A function rather than a line in the script, because the test for it can then
 * check the *behaviour*. An earlier version of that test matched the source
 * text instead, and passed happily when the filter was removed — the file still
 * mentioned the allowlist a line further down.
 */
export function partitionRequests<T extends { email: string | null }>(
  rows: T[],
): { actionable: T[]; ignored: T[] } {
  return {
    actionable: rows.filter((r) => mayDriveChanges(r.email)),
    ignored: rows.filter((r) => !mayDriveChanges(r.email)),
  };
}
