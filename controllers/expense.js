const ExpenseSchema = require("../models/ExpenseModel");
exports.addExpense = async (req, res) => {
  const { email, title, amount, category, description, date } = req.body;
  console.log(`[EXPENSE] Add expense request - email: ${email}, title: ${title}, amount: ${amount}, category: ${category}`);

  const income = ExpenseSchema({
    email,
    title,
    amount,
    category,
    description,
    date,
  });

  try {
    if (!title || !category || !date) {
      console.log(`[EXPENSE] Add expense validation failed - email: ${email}, missing required fields`);
      return res.status(400).json({ message: "All fields are required!" });
    }
    if (amount <= 0 || !amount === "number") {
      console.log(`[EXPENSE] Add expense validation failed - email: ${email}, invalid amount: ${amount}`);
      return res
        .status(400)
        .json({ message: "Amount must be a positive number!" });
    }
    await income.save();
    console.log(`[EXPENSE] Expense added successfully - email: ${email}, title: ${title}`);
    res.status(200).json({ message: "Expense Added" });
  } catch (error) {
    console.error(`[EXPENSE] Error adding expense - email: ${email}`, error);
    res.status(500).json({ message: "Server Error" });
  }
};

exports.getExpenses = async (req, res) => {
  const { email } = req.params;
  console.log(`[EXPENSE] Get expenses request - email: ${email}`);
  try {
    const incomes = await ExpenseSchema.find({ email }).sort({ date: 1 });
    console.log(`[EXPENSE] Fetched ${incomes.length} expense(s) - email: ${email}`);
    res.status(200).json(incomes);
  } catch (error) {
    console.error(`[EXPENSE] Error fetching expenses - email: ${email}`, error);
    res.status(500).json({ message: "Server Error" });
  }
};

exports.deleteExpense = async (req, res) => {
  const { id } = req.params;
  console.log(`[EXPENSE] Delete expense request - id: ${id}`);
  ExpenseSchema.findByIdAndDelete(id)
    .then((expense) => {
      console.log(`[EXPENSE] Expense deleted successfully - id: ${id}`);
      res.status(200).json({ message: "Expense Deleted", expense });
    })
    .catch((err) => {
      console.error(`[EXPENSE] Error deleting expense - id: ${id}`, err);
      res.status(500).json({ message: "Server Error" });
    });
};
