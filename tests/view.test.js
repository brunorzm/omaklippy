const test = require("node:test")
const assert = require("node:assert/strict")
const { loadModel } = require("./helpers")
const M = loadModel()

// Builds printers + statuses where each printer is in the given state.
function fleet(states, extra) {
  const printers = M.normalizePrinters(states.map((_, i) => ({ name: "P" + i, address: "10.0.0." + (i + 1) })))
  const statuses = {}
  printers.forEach((p, i) => {
    statuses[p.key] = Object.assign(M.initialStatus(p.key), { state: states[i], reason: "" }, (extra && extra[i]) || {})
  })
  return { printers, statuses }
}

test("pickHighlighted follows error > printing > paused > offline > idle", () => {
  const cases = [
    [["idle", "offline"], 1],
    [["offline", "paused"], 1],
    [["paused", "printing"], 1],
    [["printing", "error"], 1],
    [["idle", "error", "printing"], 1],
  ]
  for (const [states, expected] of cases) {
    const { printers, statuses } = fleet(states)
    assert.equal(M.pickHighlighted(printers, statuses).printer.order, expected, states.join(","))
  }
})

test("pickHighlighted breaks ties by registration order", () => {
  const { printers, statuses } = fleet(["printing", "printing"])
  assert.equal(M.pickHighlighted(printers, statuses).printer.order, 0)
})

test("pickHighlighted returns null for an empty list and counts invalid printers as offline", () => {
  assert.equal(M.pickHighlighted([], {}), null)
  const printers = M.normalizePrinters([{ name: "Bad", address: "a b" }, { name: "Ok", address: "10.0.0.1" }])
  const statuses = M.reconcileStatuses({}, printers)
  statuses[printers[1].key] = Object.assign({}, statuses[printers[1].key], { state: "idle" })
  assert.equal(M.pickHighlighted(printers, statuses).printer.name, "Bad")
})

test("buildIconState without printers", () => {
  assert.deepEqual(M.buildIconState([], {}), {
    mode: "empty",
    progress: null,
    tooltip: "OmaKlippy — nenhuma impressora configurada",
  })
})

test("buildIconState for each mode", () => {
  const cases = [
    ["printing", { percent: 42 }, 0.42, "P0 — imprimindo 42%"],
    ["paused", { percent: 42 }, 0.42, "P0 — pausada 42%"],
    ["idle", {}, null, "P0 — ociosa"],
    ["error", {}, null, "P0 — erro"],
    ["offline", {}, null, "P0 — offline"],
    ["printing", { percent: null }, null, "P0 — imprimindo"],
  ]
  for (const [state, extra, progress, tooltip] of cases) {
    const { printers, statuses } = fleet([state], [extra])
    const icon = M.buildIconState(printers, statuses)
    assert.equal(icon.mode, state)
    assert.equal(icon.progress, progress, state)
    assert.equal(icon.tooltip, tooltip)
  }
})

test("buildIconState shows the highlighted printer", () => {
  const { printers, statuses } = fleet(["idle", "printing"], [{}, { percent: 10 }])
  assert.equal(M.buildIconState(printers, statuses).tooltip, "P1 — imprimindo 10%")
})

test("buildIconState from empty settings is the empty mode", () => {
  const cfg = M.readSettings({})
  assert.equal(M.buildIconState(cfg.printers, {}).mode, "empty")
})
