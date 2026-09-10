/**
 * Whether a tool reads her data or changes it.
 *
 * The guard needs the distinction because the two deserve different deadlines:
 * a read exists to inform the sentence at the end of the turn, so once there
 * is no time left to use it there is no point fetching it — while a write *is*
 * what she asked for, takes about fifty milliseconds, and is the last thing
 * that should be dropped when a turn runs late.
 *
 * By name, deliberately. Marking forty tools by hand is forty chances to
 * forget one, and the failure of forgetting runs the wrong way: an unmarked
 * mutation would be treated as a read and refused early. A name that does not
 * announce itself as a read is assumed to change something, so a tool added
 * tomorrow with no thought given to this is guarded as a write.
 *
 * `tests/guard.test.ts` holds the prefixes against the live registry.
 */
const READ_PREFIXES = ["get_", "list_", "search_", "lookup_", "read_", "find_"];

export const isReadOnlyTool = (name: string): boolean =>
  READ_PREFIXES.some((p) => name.startsWith(p));

export const isWriteTool = (name: string): boolean => !isReadOnlyTool(name);
