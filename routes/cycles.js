const router = require("express").Router();
const auth = require("../middleware/auth");
const {
  openCycle,
  closeCycle,
  getActiveCycleBalance,
  listCycles,
  getCycleSummary,
  getCycleTransactions,
  exportCycles,
  compareCycles,
} = require("../controllers/cycle");

// Order matters: static segments before the :id param route
router.post("/open", auth, openCycle);
router.post("/close", auth, closeCycle);
router.get("/balance", auth, getActiveCycleBalance);
router.get("/compare", auth, compareCycles);
router.get("/export", auth, exportCycles);
router.get("/:id/summary", auth, getCycleSummary);
router.get("/:id/transactions", auth, getCycleTransactions);
router.get("/", auth, listCycles);

module.exports = router;
