const TransferSchema = require("../models/TransferModel");
const { emit } = require("../middleware/sseManager");
const { getActiveCycleId } = require("../utils/cycleHelper");

exports.addTransfer = async (req, res) => {
  const email = req.user.email;
  const { title, category, description, date, direction } = req.body;
  const amount = parseFloat(req.body.amount);

  if (!title || !category || !date || !direction) {
    return res.status(400).json({ message: "All fields are required!" });
  }
  if (direction !== "in" && direction !== "out") {
    return res.status(400).json({ message: "Direction must be 'in' or 'out'!" });
  }
  if (isNaN(amount) || amount <= 0) {
    return res.status(400).json({ message: "Amount must be a positive number!" });
  }

  try {
    const cycleId = await getActiveCycleId(email);
    if (!cycleId) {
      return res.status(409).json({ code: "NO_ACTIVE_CYCLE", message: "No active cycle. Create one first." });
    }
    await new TransferSchema({ email, cycleId, title, amount, category, description, date, direction }).save();
    emit(email, "transfer_changed", { action: "add" });
    res.status(200).json({ message: "Transfer Added" });
  } catch (error) {
    console.error("addTransfer failed:", error.message);
    res.status(500).json({ message: "Server Error" });
  }
};

exports.getTransfers = async (req, res) => {
  const email = req.user.email;
  try {
    const cycleId = await getActiveCycleId(email);
    if (!cycleId) {
      return res.status(409).json({ code: "NO_ACTIVE_CYCLE", message: "No active cycle. Create one first." });
    }
    const transfers = await TransferSchema.find({ email, cycleId }).sort({ date: 1 });
    res.status(200).json(transfers);
  } catch (error) {
    console.error("getTransfers failed:", error.message);
    res.status(500).json({ message: "Server Error" });
  }
};

exports.deleteTransfer = async (req, res) => {
  const { id } = req.params;
  try {
    await TransferSchema.findByIdAndDelete(id);
    emit(req.user.email, "transfer_changed", { action: "delete" });
    res.status(200).json({ message: "Transfer Deleted" });
  } catch (error) {
    console.error("deleteTransfer failed:", error.message);
    res.status(500).json({ message: "Server Error" });
  }
};
