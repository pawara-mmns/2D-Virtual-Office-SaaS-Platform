import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, rmdirSync, writeFileSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const projectRef = "rofutnholbtdmxccrkbs";
const projectName = "2D-Virtual-Office-SaaS-Platform";
const marker = "organization-policy-tests-rolled-back";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function validateTestConfiguration(env, linkedRef, webUrl) {
  const users = [env.ORG_TEST_USER_A, env.ORG_TEST_USER_B, env.ORG_TEST_USER_C];
  if (users.some((value) => !value)) return { ready: false, reason: "Three authorized verified test-account UUIDs are required." };
  if (users.some((value) => !uuid.test(value)) || new Set(users.map((value) => value.toLowerCase())).size !== 3) {
    throw new Error("Test account UUIDs must be valid and distinct.");
  }
  if (env.ORG_TEST_CONFIRM_DEVELOPMENT !== "yes" || env.ORG_TEST_PROJECT_REF !== projectRef || linkedRef !== projectRef) {
    throw new Error("Approved development project and CLI link must match exactly.");
  }
  let url;
  try { url = new URL(webUrl); } catch { throw new Error("Web Supabase URL is missing or invalid."); }
  if (url.origin !== `https://${projectRef}.supabase.co` || url.pathname !== "/" || url.search || url.hash || url.username || url.password) {
    throw new Error("Web configuration does not match the approved development project.");
  }
  return { ready: true, users };
}

export function preparePolicySql(source, users) {
  if (users.length !== 3 || users.some((value) => !uuid.test(value))) throw new Error("Invalid test identities.");
  let sql = source.replace(/^\\set ON_ERROR_STOP on\r?\n/m, "").replace(/^\\echo[^\r\n]*(?:\r?\n|$)/m, "");
  if (/^\s*\\/m.test(sql) || /^\s*(?:commit|prepare transaction|start transaction)\b/im.test(sql)) {
    throw new Error("The policy suite must contain only the reviewed rollback-only transaction.");
  }
  if ((sql.match(/^begin;\s*$/gm) ?? []).length !== 1 || (sql.match(/^rollback;\s*$/gm) ?? []).length !== 1 || !/rollback;\s*$/.test(sql)) {
    throw new Error("The policy suite must end in an unconditional ROLLBACK.");
  }
  sql = sql.replaceAll(":'confirm_development'", "'yes'");
  for (const [index, name] of ["user_a", "user_b", "user_c"].entries()) sql = sql.replaceAll(`:'${name}'`, `'${users[index]}'`);
  if (/:'[a-z_]+/.test(sql)) throw new Error("Unresolved SQL test input.");
  sql = sql.replace(/^begin;/m, "begin;\nset local lock_timeout = '5s';\nset local statement_timeout = '45s';");
  return `${sql}\nselect '${marker}'::text as organization_test_result;\n`;
}

function cli(args) {
  // All command arguments are fixed or a generated path under .cache. No env
  // values or account identities are interpolated into a shell command.
  const result = process.platform === "win32"
    ? spawnSync("cmd.exe", ["/d", "/s", "/c", `pnpm.cmd exec supabase ${args.map((arg) => `"${arg}"`).join(" ")}`], { cwd: root, encoding: "utf8", timeout: 120000, windowsHide: true })
    : spawnSync("pnpm", ["exec", "supabase", ...args], { cwd: root, encoding: "utf8", timeout: 120000 });
  if (result.status !== 0) throw new Error("Supabase CLI request failed. No test success is recorded; check CLI access and the policy suite locally. Raw CLI output is suppressed to protect local configuration.");
  try { return JSON.parse(result.stdout); } catch { throw new Error("Supabase CLI returned an unexpected result format."); }
}

function inventoryProjects(value, result = []) {
  if (Array.isArray(value)) value.forEach((item) => inventoryProjects(item, result));
  else if (value && typeof value === "object") {
    if (Object.values(value).includes(projectRef) && value.name === projectName && value.linked === true && value.status === "ACTIVE_HEALTHY") result.push(value);
    Object.values(value).forEach((item) => inventoryProjects(item, result));
  }
  return result;
}

export function run() {
  const envPath = join(root, "supabase/.env.organization-tests.local");
  if (existsSync(envPath)) loadEnvFile(envPath);
  const link = join(root, "supabase/.temp/project-ref");
  // Read only the public URL; never log the web env file or load credentials.
  const webEnv = join(root, "apps/web/.env");
  const webLocal = join(root, "apps/web/.env.local");
  const webUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    ?? (existsSync(webLocal) ? parseEnv(readFileSync(webLocal, "utf8")).NEXT_PUBLIC_SUPABASE_URL : undefined)
    ?? (existsSync(webEnv) ? parseEnv(readFileSync(webEnv, "utf8")).NEXT_PUBLIC_SUPABASE_URL : undefined);
  const configuration = validateTestConfiguration(process.env, existsSync(link) ? readFileSync(link, "utf8").trim() : "", webUrl);
  if (!configuration.ready) {
    console.log(`NOT TESTED: ${configuration.reason} See docs/organizations.md#dedicated-test-accounts.`);
    return 2;
  }
  if (process.argv.includes("--check")) {
    console.log("PASSED: local test configuration and approved project link match. Account verification and policy execution have NOT been performed.");
    return 0;
  }
  if (inventoryProjects(cli(["projects", "list", "--output", "json"])).length !== 1) {
    throw new Error("Linked project inventory identity/health did not match the approved development target.");
  }
  const sql = preparePolicySql(readFileSync(join(root, "supabase/tests/organization_policies.sql"), "utf8"), configuration.users);
  mkdirSync(join(root, ".cache"), { recursive: true });
  const directory = mkdtempSync(join(root, ".cache/organization-test-"));
  try {
    const path = join(directory, "rollback.sql");
    writeFileSync(path, sql, { encoding: "utf8", mode: 0o600 });
    const result = cli(["db", "query", "--linked", "--file", path]);
    if (result.rows?.length !== 1 || result.rows[0].organization_test_result !== marker) {
      throw new Error("Rollback completion marker missing. No test success is recorded.");
    }
    console.log("PASSED: live organization provisioning and role-based tenant policy assertions. Final ROLLBACK confirmed; no Auth records changed. Browser sessions and concurrent requests are separate checks.");
    return 0;
  } finally {
    // A single generated file/directory inside the verified workspace cache.
    rmSync(join(directory, "rollback.sql"), { force: true });
    rmdirSync(directory);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = run(); }
  catch (error) { console.error(`FAILED: ${error.message}`); process.exitCode = 1; }
}
