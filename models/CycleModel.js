const mongoose = require("mongoose");

const CycleSchema = new mongoose.Schema(
  {
    email: { type: String, required: true },
    label: { type: String, required: true, trim: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, default: null },
    isActive: { type: Boolean, required: true },
  },
  { timestamps: true }
);

// Enforce one active cycle per user at DB level
CycleSchema.index(
  { email: 1, isActive: 1 },
  { unique: true, partialFilterExpression: { isActive: true } }
);

CycleSchema.index({ email: 1, createdAt: -1 });

module.exports = mongoose.model("Cycle", CycleSchema);
