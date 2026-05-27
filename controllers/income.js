const IncomeSchema = require("../models/IncomeModel");
const { emit } = require("../middleware/sseManager");
const { getActiveCycleId } = require("../utils/cycleHelper");

exports.addIncome = async (req, res) => {
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
    await new IncomeSchema({ email, cycleId, title, amount, category, description, date }).save();
    emit(email, "income_changed", { action: "add" });
    res.status(200).json({ message: "Income Added" });
  } catch (error) {
    console.error("addIncome failed:", error.message);
    res.status(500).json({ message: "Server Error" });
  }
};

exports.getIncomes = async (req, res) => {
  const email = req.user.email;
  try {
    const cycleId = await getActiveCycleId(email);
    if (!cycleId) {
      return res.status(409).json({ code: "NO_ACTIVE_CYCLE", message: "No active cycle. Create one first." });
    }
    const incomes = await IncomeSchema.find({ email, cycleId }).sort({ date: 1 });
    res.status(200).json(incomes);
  } catch (error) {
    console.error("getIncomes failed:", error.message);
    res.status(500).json({ message: "Server Error" });
  }
};

exports.deleteIncome = async (req, res) => {
  const { id } = req.params;
  try {
    await IncomeSchema.findByIdAndDelete(id);
    emit(req.user.email, "income_changed", { action: "delete" });
    res.status(200).json({ message: "Income Deleted" });
  } catch (error) {
    console.error("deleteIncome failed:", error.message);
    res.status(500).json({ message: "Server Error" });
  }
};
