const Cycle = require("../models/CycleModel");

// Returns the active cycleId for a user, or null if they have no active cycle.
// No side effects — callers must handle the null case (block the action).
async function getActiveCycleId(email) {
  const cycle = await Cycle.findOne({ email, isActive: true }).select("_id");
  return cycle ? cycle._id : null;
}

module.exports = { getActiveCycleId };
