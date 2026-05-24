const {
  addExpense,
  getExpenses,
  deleteExpense,
} = require("../controllers/expense");
const {
  addIncome,
  getIncomes,
  deleteIncome,
} = require("../controllers/income");
const {
  addTransfer,
  getTransfers,
  deleteTransfer,
} = require("../controllers/transfer");
const auth = require("../middleware/auth");
const { addClient, removeClient } = require("../middleware/sseManager");
const router = require("express").Router();

router.get("/events", auth, (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const email = req.user.email;
  addClient(email, res);

  const heartbeat = setInterval(() => res.write(":heartbeat\n\n"), 30000);

  req.on("close", () => {
    clearInterval(heartbeat);
    removeClient(email, res);
  });
});

router
  .post("/add-income", auth, addIncome)
  .get("/get-incomes", auth, getIncomes)
  .delete("/delete-income/:id", auth, deleteIncome)
  .post("/add-expense", auth, addExpense)
  .get("/get-expenses", auth, getExpenses)
  .delete("/delete-expense/:id", auth, deleteExpense)
  .post("/add-transfer", auth, addTransfer)
  .get("/get-transfers", auth, getTransfers)
  .delete("/delete-transfer/:id", auth, deleteTransfer);

module.exports = router;
