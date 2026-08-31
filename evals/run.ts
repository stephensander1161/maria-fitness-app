import { MODEL } from "@/lib/agent/model";
import { LIMITS } from "@/lib/limits";
import {
  addUsage, runEval, sweepOrphans, usageSnapshot,
  type EvalCase, type EvalResult, type UsageDelta,
} from "./harness";
import { JUDGE_MODEL, judgeUsage } from "./judge";
import { onboarding } from "./cases/onboarding";
import { honesty } from "./cases/honesty";
import { noFalseClaims } from "./cases/no-false-claims";
import { grounding } from "./cases/grounding";
import { alreadyLogged } from "./cases/already-logged";

/**
 * Behavioural regression suite for the coach.
 *
 *   npm run eval                       every case
 *   npm run eval -- honesty grounding  a subset
 *
 * Each case drives the real agent loop against a throwaway profile row, so this
 * is a paid, slow, non-hermetic test run — the opposite of `npm run test`, and
 * the only kind that can catch the coach lying about what it did.
 */

const CASES: EvalCase[] = [onboarding, honesty, noFalseClaims, grounding, alreadyLogged];

const ZERO: UsageDelta = {
  inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, costMicros: 0,
};

async function main() {
  const wanted = process.argv.slice(2).filter((a) => !a.startsWith("-"));
  const unknown = wanted.filter((w) => !CASES.some((c) => c.name === w));
  if (unknown.length) {
    console.error(`Unknown eval(s): ${unknown.join(", ")}`);
    console.error(`Available: ${CASES.map((c) => c.name).join(", ")}`);
    process.exit(2);
  }
  const cases = wanted.length ? CASES.filter((c) => wanted.includes(c.name)) : CASES;

  console.log("");
  console.log(bold("Coach behavioural evals"));
  console.log(`  coach model : ${MODEL}`);
  console.log(`  judge model : ${JUDGE_MODEL}`);
  console.log(`  running     : ${cases.length} of ${CASES.length} case(s)`);
  console.log("");
  console.log(
    yellow("  These call the live Anthropic API and write to the live database."),
  );
  console.log(
    yellow("  This run costs real money, and it counts against the app's daily spend cap."),
  );
  console.log("");

  const orphans = await sweepOrphans();
  if (orphans) console.log(dim(`  swept ${orphans} scratch profile(s) left by an interrupted run\n`));

  const before = await usageSnapshot();
  const results: EvalResult[] = [];

  for (const c of cases) {
    process.stdout.write(`  ${c.name} … `);
    const result = await runEval(c);
    results.push(result);
    console.log(
      `${result.passed ? green("pass") : red("FAIL")}  ${dim(
        `${result.checks.filter((k) => k.ok).length}/${result.checks.length} checks, ${(result.ms / 1000).toFixed(1)}s`,
      )}`,
    );
  }

  console.log("");
  console.log(bold("Results"));
  console.log(dim("  " + "─".repeat(74)));
  console.log(
    dim(`  ${"EVAL".padEnd(18)}${"RESULT".padEnd(8)}${"CHECKS".padEnd(9)}${"TIME".padEnd(8)}COST`),
  );
  for (const r of results) {
    const checks = `${r.checks.filter((k) => k.ok).length}/${r.checks.length}`;
    // Pad first, colour second — escape codes have width in a string and none
    // on screen, so padding a coloured string skews every column after it.
    const verdict = r.passed ? green("pass".padEnd(8)) : red("FAIL".padEnd(8));
    console.log(
      `  ${r.name.padEnd(18)}${verdict}${checks.padEnd(9)}` +
        `${`${(r.ms / 1000).toFixed(1)}s`.padEnd(8)}${money(r.coach.costMicros)}`,
    );
    for (const check of r.checks.filter((k) => !k.ok)) {
      console.log(red(`      ✗ [${check.kind}] ${check.name}`));
      console.log(dim(`        ${check.detail}`));
    }
    if (!r.passed) {
      console.log(dim(`        regression: ${r.bug}`));
      const last = r.turns.at(-1);
      if (last) {
        console.log(dim(`        she said: ${last.user}`));
        console.log(dim(`        it said : ${excerpt(last.text)}`));
        console.log(dim(`        tools   : ${last.tools.join(", ") || "none"}`));
      }
    }
  }
  console.log(dim("  " + "─".repeat(74)));

  const coach = results.reduce((acc, r) => addUsage(acc, r.coach), ZERO);
  const judge = judgeUsage();
  const total = coach.costMicros + judge.costMicros;
  const after = await usageSnapshot();

  console.log("");
  console.log(bold("Cost"));
  console.log(
    `  coach (${MODEL}): ${money(coach.costMicros)}  ` +
      dim(
        `${coach.inputTokens} in / ${coach.outputTokens} out / ` +
          `${coach.cacheReadTokens} cache-read / ${coach.cacheWriteTokens} cache-write`,
      ),
  );
  console.log(
    `  judge (${JUDGE_MODEL}): ${money(judge.costMicros)}  ` +
      dim(`${judge.calls} call(s), ${judge.inputTokens} in / ${judge.outputTokens} out`),
  );
  console.log(bold(`  total this run: ${money(total)}`));
  console.log("");
  console.log(
    `  App spend recorded today: ${money(after.costMicros)} of ${money(LIMITS.dailyCostMicros)} ceiling.`,
  );
  if (after.costMicros >= LIMITS.dailyCostMicros) {
    console.log(
      red("  The daily ceiling is now spent — her coach is paused until tomorrow."),
    );
  } else if (after.costMicros > LIMITS.dailyCostMicros * 0.5) {
    console.log(
      yellow("  Over half the daily budget is gone. Another full run may pause her coach."),
    );
  }
  console.log(dim(`  (before this run: ${money(before.costMicros)})`));

  const failed = results.filter((r) => !r.passed);
  console.log("");
  console.log(
    failed.length
      ? red(bold(`${failed.length} of ${results.length} evals failed: ${failed.map((f) => f.name).join(", ")}`))
      : green(bold(`All ${results.length} evals passed.`)),
  );
  console.log("");

  process.exit(failed.length ? 1 : 0);
}

const money = (micros: number) => `$${(micros / 1_000_000).toFixed(4)}`;

const excerpt = (text: string, max = 400) =>
  (text.length > max ? `${text.slice(0, max)}…` : text).replace(/\s*\n\s*/g, " ⏎ ");

/* Colour only when a human is watching; CI logs stay clean. */
const tty = process.stdout.isTTY === true;
const wrap = (code: string) => (s: string) => (tty ? `\u001b[${code}m${s}\u001b[0m` : s);
const bold = wrap("1");
const dim = wrap("2");
const red = wrap("31");
const green = wrap("32");
const yellow = wrap("33");

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
