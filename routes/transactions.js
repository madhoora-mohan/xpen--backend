// const { valid } = require("joi");
const {
  addExpense,
  getExpenses,
  deleteExpense,
  getExpensesWCategory
} = require("../controllers/expense");
const {
  addIncome,
  getIncomes,
  deleteIncome,
} = require("../controllers/income");
const { getLimit, updateLimit } = require("../controllers/limit");
// const { User, validate } = require("../models/User.jsx");
const router = require("express").Router();
// const bcrypt = require("bcrypt");

router
  .post("/add-income/:email", addIncome)
  .get("/get-incomes/:email", getIncomes)
  .delete("/delete-income/:id", deleteIncome)
  .post("/add-expense/:email", addExpense)
  .get("/get-expenses/:email", getExpenses)
  // .get("/get-expenses/:email", getExpensesWCategory)
  .delete("/delete-expense/:id", deleteExpense)
  .get("/get-limit/:email", getLimit)
  .put("/update-limit/:email/:uplimit", updateLimit);

module.exports = router;
