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
const { getLimit, updateLimit } = require("../controllers/limit");
const auth = require("../middleware/auth");
const router = require("express").Router();

router
  .post("/add-income/:email", auth, addIncome)
  .get("/get-incomes/:email", auth, getIncomes)
  .delete("/delete-income/:id", auth, deleteIncome)
  .post("/add-expense/:email", auth, addExpense)
  .get("/get-expenses/:email", auth, getExpenses)
  .delete("/delete-expense/:id", auth, deleteExpense)
  .post("/add-transfer/:email", auth, addTransfer)
  .get("/get-transfers/:email", auth, getTransfers)
  .delete("/delete-transfer/:id", auth, deleteTransfer)
  .get("/get-limit/:email", auth, getLimit)
  .put("/update-limit", auth, updateLimit);

module.exports = router;
