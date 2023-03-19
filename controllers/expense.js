const ExpenseSchema = require("../models/ExpenseModel");
exports.addExpense = async (req, res) => {
  const { email, title, amount, category, description, date } = req.body;

  const income = ExpenseSchema({
    email,
    title,
    amount,
    category,
    description,
    date,
  });

  try {
    //validations
    if (!title || !category || !date) {
      return res.status(400).json({ message: "All fields are required!" });
    }
    if (amount <= 0 || !amount === "number") {
      return res
        .status(400)
        .json({ message: "Amount must be a positive number!" });
    }
    await income.save();
    res.status(200).json({ message: "Expense Added" });
  } catch (error) {
    res.status(500).json({ message: "Server Error" });
  }

  // console.log(income);
};

exports.getExpenses = async (req, res) => {
  try {
    const { email } = req.params;
    const incomes = await ExpenseSchema.find({ email: email }).sort({
      date: 1,
    });
    res.status(200).json(incomes);
  } catch (error) {
    res.status(500).json({ message: "Server Error" });
  }
};

exports.deleteExpense = async (req, res) => {
  const { id } = req.params;
  ExpenseSchema.findByIdAndDelete(id)
    .then((income) => {
      res.status(200).json({ message: "Expense Deleted", income });
    })
    .catch((err) => {
      res.status(500).json({ message: "Server Error" });
    });
};
