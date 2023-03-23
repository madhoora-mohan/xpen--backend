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
const { getLimit, updateLimit } = require("../controllers/limit");
const router = require("express").Router();

router
  .post("/add-income/:email", addIncome)
  .get("/get-incomes/:email", getIncomes)
  .delete("/delete-income/:id", deleteIncome)
  .post("/add-expense/:email", addExpense)
  .get("/get-expenses/:email", getExpenses)
  .delete("/delete-expense/:id", deleteExpense)
  .get("/get-limit/:email", getLimit)
  .put("/update-limit/:email/:uplimit", updateLimit);

module.exports = router;
