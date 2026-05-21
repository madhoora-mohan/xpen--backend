const IncomeSchema = require("../models/IncomeModel");

exports.addIncome = async (req, res) => {
  const email = req.user.email;
  const { title, amount, category, description, date } = req.body;
  console.log(`[INCOME] Add income request - email: ${email}, title: ${title}, amount: ${amount}, category: ${category}`);

  const income = IncomeSchema({
    email,
    title,
    amount,
    category,
    description,
    date,
  });

  try {
    if (!title || !category || !date) {
      console.log(`[INCOME] Add income validation failed - email: ${email}, missing required fields`);
      return res.status(400).json({ message: "All fields are required!" });
    }
    if (amount <= 0 || !amount === "number") {
      console.log(`[INCOME] Add income validation failed - email: ${email}, invalid amount: ${amount}`);
      return res
        .status(400)
        .json({ message: "Amount must be a positive number!" });
    }
    await income.save();
    console.log(`[INCOME] Income added successfully - email: ${email}, title: ${title}`);
    res.status(200).json({ message: "Income Added" });
  } catch (error) {
    console.error(`[INCOME] Error adding income - email: ${email}`, error);
    res.status(500).json({ message: "Server Error" });
  }
};

exports.getIncomes = async (req, res) => {
  const email = req.user.email;
  console.log(`[INCOME] Get incomes request - email: ${email}`);
  try {
    const incomes = await IncomeSchema.find({ email }).sort({ date: 1 });
    console.log(`[INCOME] Fetched ${incomes.length} income(s) - email: ${email}`);
    res.status(200).json(incomes);
  } catch (error) {
    console.error(`[INCOME] Error fetching incomes - email: ${email}`, error);
    res.status(500).json({ message: "Server Error" });
  }
};

exports.deleteIncome = async (req, res) => {
  const { id } = req.params;
  console.log(`[INCOME] Delete income request - id: ${id}`);
  IncomeSchema.findByIdAndDelete(id)
    .then(() => {
      console.log(`[INCOME] Income deleted successfully - id: ${id}`);
      res.status(200).json({ message: "Income Deleted" });
    })
    .catch((err) => {
      console.error(`[INCOME] Error deleting income - id: ${id}`, err);
      res.status(500).json({ message: "Server Error" });
    });
};
