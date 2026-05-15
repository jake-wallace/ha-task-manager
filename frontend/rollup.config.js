const path = require("node:path");
const resolve = require("@rollup/plugin-node-resolve");
const replace = require("@rollup/plugin-replace");
const typescript = require("@rollup/plugin-typescript");

module.exports = {
  input: path.resolve(__dirname, "src/ha-task-manager-panel.ts"),
  output: {
    file: path.resolve(
      __dirname,
      "../custom_components/ha_task_manager/frontend/ha-task-manager-panel.js"
    ),
    format: "es"
  },
  plugins: [
    replace({
      "process.env.NODE_ENV": JSON.stringify("production"),
      preventAssignment: true
    }),
    resolve.nodeResolve(),
    typescript({
      tsconfig: path.resolve(__dirname, "tsconfig.json")
    })
  ]
};