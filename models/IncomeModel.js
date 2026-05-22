const mongoose = require("mongoose");

const IncomeSchema = new mongoose.Schema(
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
      default: "income",
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

module.exports = mongoose.model("Income", IncomeSchema);
