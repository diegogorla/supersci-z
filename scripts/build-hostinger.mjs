import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";

function run(command, args, timeout = 300000) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    env: { ...process.env, SCIZ_RUNTIME: "node", NODE_ENV: "production" },
    timeout,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run("npm", ["run", "lint"]);
run(process.execPath, ["node_modules/vinext/dist/cli.js", "build"]);
if (!existsSync("dist/standalone/server.js")) {
  throw new Error("Build incomplete: dist/standalone/server.js is missing");
}
const tests = readdirSync("tests").filter(name => name.endsWith(".test.mjs")).sort();
if (!tests.length) throw new Error("No test files found; deployment blocked");
run(process.execPath, ["--test", ...tests.map(name => "tests/" + name)]);
