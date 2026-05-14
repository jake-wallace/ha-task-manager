const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("built panel bundle does not reference browser-undefined process global", () => {
  const bundlePath = path.resolve(
    __dirname,
    "../../custom_components/ha_task_manager/frontend/ha-task-manager-panel.js"
  );
  const bundle = fs.readFileSync(bundlePath, "utf8");

  assert.equal(
    bundle.includes("process.env.NODE_ENV"),
    false,
    "bundle must not contain process.env.NODE_ENV because Home Assistant panel runs in browser"
  );
});
