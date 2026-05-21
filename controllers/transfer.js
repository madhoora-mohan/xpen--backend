const TransferSchema = require("../models/TransferModel");

exports.addTransfer = async (req, res) => {
  const email = req.user.email;
  const { title, amount, category, description, date, direction } = req.body;
  console.log(`[TRANSFER] Add transfer request - email: ${email}, title: ${title}, amount: ${amount}, category: ${category}, direction: ${direction}`);

  const transfer = TransferSchema({
    email,
    title,
    amount,
    category,
    description,
    date,
    direction,
  });

  try {
    if (!title || !category || !date || !direction) {
      console.log(`[TRANSFER] Add transfer validation failed - email: ${email}, missing required fields`);
      return res.status(400).json({ message: "All fields are required!" });
    }
    if (direction !== "in" && direction !== "out") {
      console.log(`[TRANSFER] Add transfer validation failed - email: ${email}, invalid direction: ${direction}`);
      return res
        .status(400)
        .json({ message: "Direction must be 'in' or 'out'!" });
    }
    if (amount <= 0 || !amount === "number") {
      console.log(`[TRANSFER] Add transfer validation failed - email: ${email}, invalid amount: ${amount}`);
      return res
        .status(400)
        .json({ message: "Amount must be a positive number!" });
    }
    await transfer.save();
    console.log(`[TRANSFER] Transfer added successfully - email: ${email}, title: ${title}, direction: ${direction}`);
    res.status(200).json({ message: "Transfer Added" });
  } catch (error) {
    console.error(`[TRANSFER] Error adding transfer - email: ${email}`, error);
    res.status(500).json({ message: "Server Error" });
  }
};

exports.getTransfers = async (req, res) => {
  const email = req.user.email;
  console.log(`[TRANSFER] Get transfers request - email: ${email}`);
  try {
    const transfers = await TransferSchema.find({ email }).sort({ date: 1 });
    console.log(`[TRANSFER] Fetched ${transfers.length} transfer(s) - email: ${email}`);
    res.status(200).json(transfers);
  } catch (error) {
    console.error(`[TRANSFER] Error fetching transfers - email: ${email}`, error);
    res.status(500).json({ message: "Server Error" });
  }
};

exports.deleteTransfer = async (req, res) => {
  const { id } = req.params;
  console.log(`[TRANSFER] Delete transfer request - id: ${id}`);
  TransferSchema.findByIdAndDelete(id)
    .then(() => {
      console.log(`[TRANSFER] Transfer deleted successfully - id: ${id}`);
      res.status(200).json({ message: "Transfer Deleted" });
    })
    .catch((err) => {
      console.error(`[TRANSFER] Error deleting transfer - id: ${id}`, err);
      res.status(500).json({ message: "Server Error" });
    });
};
