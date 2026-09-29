const test = require("node:test")
const assert = require("node:assert/strict")
const { loadModel } = require("./helpers")
const M = loadModel()

test("buildQueryUrl asks for every object the widget reads", () => {
  assert.equal(
    M.buildQueryUrl("http://192.168.1.50"),
    "http://192.168.1.50/printer/objects/query?webhooks&print_stats&virtual_sdcard&display_status&extruder=temperature,target&heater_bed=temperature,target"
  )
})

test("buildCurlArgs sets both timeouts and appends the HTTP code", () => {
  assert.deepEqual(M.buildCurlArgs("http://h/x", 3), [
    "curl", "-sS",
    "--connect-timeout", "3",
    "--max-time", "3",
    "-H", "Accept: application/json",
    "-w", "\n%{http_code}",
    "http://h/x",
  ])
})
