const mongoose = require("mongoose");

const TransferSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxLength: 50,
    },
    amount: {
      type: Number,
      required: true,
    },
    type: {
      type: String,
      default: "transfer",
    },
    direction: {
      type: String,
      enum: ["in", "out"],
      required: true,
    },
    date: {
      type: Date,
      required: true,
    },
    category: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      maxLength: 200,
      trim: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Transfer", TransferSchema);
