.pragma library
// State shared by every OmaKlippy widget instance in the shell (one per bar).
// A plain holder: every rule lives in Model.js. It survives a plugin hot
// reload, so changes to this file only apply after omarchy-restart-shell.
var state = { registry: null, protections: {}, sends: {}, notify: { available: null, message: "" } }
