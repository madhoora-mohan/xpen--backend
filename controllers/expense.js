const ExpenseSchema = require("../models/ExpenseModel");
const { emit } = require("../middleware/sseManager");
const { getActiveCycleId } = require("../utils/cycleHelper");

exports.addExpense = async (req, res) => {
  const email = req.user.email;
  const { title, category, description, date } = req.body;
  const amount = parseFloat(req.body.amount);

  if (!title || !category || !date) {
    return res.status(400).json({ message: "All fields are required!" });
  }
  if (isNaN(amount) || amount <= 0) {
    return res.status(400).json({ message: "Amount must be a positive number!" });
  }

  try {
    const cycleId = await getActiveCycleId(email);
    if (!cycleId) {
      return res.status(409).json({ code: "NO_ACTIVE_CYCLE", message: "No active cycle. Create one first." });
    }
    await new ExpenseSchema({ email, cycleId, title, amount, category, description, date }).save();
    emit(email, "expense_changed", { action: "add" });
    res.status(200).json({ message: "Expense Added" });
  } catch (error) {
    console.error("addExpense failed:", error.message);
    res.status(500).json({ message: "Server Error" });
  }
};

exports.getExpenses = async (req, res) => {
  const email = req.user.email;
  try {
    const cycleId = await getActiveCycleId(email);
    if (!cycleId) {
      return res.status(409).json({ code: "NO_ACTIVE_CYCLE", message: "No active cycle. Create one first." });
    }
    const expenses = await ExpenseSchema.find({ email, cycleId }).sort({ date: 1 });
    res.status(200).json(expenses);
  } catch (error) {
    console.error("getExpenses failed:", error.message);
    res.status(500).json({ message: "Server Error" });
  }
};

exports.deleteExpense = async (req, res) => {
  const { id } = req.params;
  const email = req.user.email;
  try {
    const doc = await ExpenseSchema.findOneAndDelete({ _id: id, email });
    if (!doc) return res.status(404).json({ message: "Expense not found." });
    emit(email, "expense_changed", { action: "delete" });
    res.status(200).json({ message: "Expense Deleted" });
  } catch (error) {
    console.error("deleteExpense failed:", error.message);
    res.status(500).json({ message: "Server Error" });
  }
};
