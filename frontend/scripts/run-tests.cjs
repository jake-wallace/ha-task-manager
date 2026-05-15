const { spawn } = require("node:child_process");
const path = require("node:path");
const { createRequire } = require("node:module");

const projectRoot = path.resolve(__dirname, "..");
const requireFromProject = createRequire(path.join(projectRoot, "package.json"));
const vitestBin = requireFromProject.resolve("vitest/vitest.mjs");

function runProcess(command, args, { cwd = projectRoot } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: "inherit",
    });

    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          signal
            ? `${command} terminated with signal ${signal}`
            : `${command} exited with code ${code}`
        )
      );
    });
  });
}

async function main() {
  const forwardedArgs = process.argv.slice(2);

  await runProcess(process.execPath, [vitestBin, "run", ...forwardedArgs]);

  if (forwardedArgs.length > 0) {
    return;
  }

  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

  await runProcess(npmCommand, ["run", "build"]);
  await runProcess(process.execPath, [
    "--test",
    path.join("tests", "bundle-runtime-compat.test.cjs"),
  ]);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});