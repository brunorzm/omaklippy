// Shared helpers for the node:test suites.
const fs = require("node:fs")
const path = require("node:path")

function loadModel() {
  return require("../Model.js")
}

// Returns { exitCode, stdout } exactly as the widget hands them to parseResponse.
function loadFixture(name) {
  const file = path.join(__dirname, "fixtures", name + ".json")
  return JSON.parse(fs.readFileSync(file, "utf8"))
}

module.exports = { loadModel, loadFixture }
