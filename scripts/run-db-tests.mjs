// Runs the pgTAP files in supabase/tests/database against the linked
// Supabase project without Docker (`supabase test db` needs Docker even
// with --linked).
//
// Each file already runs inside begin/rollback. This runner collects the
// TAP lines into a temp table and replaces the final `rollback;` with a
// deliberate exception carrying the results, so the transaction is always
// rolled back and the output survives the trip through `supabase db query`.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const TEST_DIR = "supabase/tests/database";
const TAP_CALL =
  /^select (\* from finish\(\)|(plan|ok|is|isnt|throws_ok|lives_ok|results_eq|set_eq|bag_eq|row_eq|has_[a-z_]+|hasnt_[a-z_]+|col_[a-z_]+|policies_are|policy_[a-z_]+)\()/;

const files = readdirSync(TEST_DIR).filter((f) => f.endsWith(".test.sql")).sort();
const workDir = mkdtempSync(join(tmpdir(), "db-tests-"));
let failed = false;

for (const file of files) {
  const source = readFileSync(join(TEST_DIR, file), "utf8").split(/\r?\n/);
  const out = [];
  for (const line of source) {
    if (/^set local search_path/.test(line)) {
      out.push(line);
      out.push("create temp table __tap (n serial, line text);");
      out.push("grant all on __tap to anon, authenticated;");
      out.push("grant all on sequence __tap_n_seq to anon, authenticated;");
    } else if (TAP_CALL.test(line)) {
      out.push(line.replace(/^select /, "insert into __tap (line) select "));
    } else if (/^rollback;\s*$/.test(line)) {
      out.push("reset role;");
      out.push(
        "do $tap$ begin raise exception E'TAP_RESULTS\\n%', " +
          "(select string_agg(line, E'\\n' order by n) from __tap); end $tap$;",
      );
    } else {
      out.push(line);
    }
  }

  const tmpFile = join(workDir, file);
  writeFileSync(tmpFile, out.join("\n"));

  let output;
  try {
    output = execFileSync("supabase", ["db", "query", "--linked", "-f", tmpFile], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      shell: process.platform === "win32",
    });
  } catch (err) {
    output = `${err.stdout ?? ""}${err.stderr ?? ""}`;
  }

  const marker = output.indexOf("TAP_RESULTS");
  console.log(`\n# ${file}`);
  if (marker === -1) {
    // The file errored before reaching the end: show the raw error.
    console.log(output.trim());
    failed = true;
    continue;
  }
  const tap = output
    .slice(marker + "TAP_RESULTS".length)
    // The message is JSON nested in JSON, so newlines arrive double-escaped.
    .replace(/\\\\n|\\n/g, "\n")
    .replace(/\\'/g, "'")
    .split("\n")
    .map((l) => l.replace(/^[\s"]+|[\s",}]+$/g, ""))
    .filter((l) => /^(ok|not ok|1\.\.|#)/.test(l));
  console.log(tap.join("\n"));
  if (tap.some((l) => l.startsWith("not ok") || /Looks like/.test(l))) failed = true;
}

rmSync(workDir, { recursive: true, force: true });
console.log(failed ? "\nFAILED" : "\nAll database tests passed");
process.exit(failed ? 1 : 0);
