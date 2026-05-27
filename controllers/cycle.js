const mongoose = require("mongoose");
const ExcelJS = require("exceljs");
const Cycle = require("../models/CycleModel");
const Income = require("../models/IncomeModel");
const Expense = require("../models/ExpenseModel");
const Transfer = require("../models/TransferModel");

async function computeNetCash(cycleId) {
  const [incomes, expenses, transfers] = await Promise.all([
    Income.aggregate([
      { $match: { cycleId } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]),
    Expense.aggregate([
      { $match: { cycleId } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]),
    Transfer.aggregate([
      { $match: { cycleId } },
      {
        $group: {
          _id: null,
          totalIn: {
            $sum: { $cond: [{ $eq: ["$direction", "in"] }, "$amount", 0] },
          },
          totalOut: {
            $sum: { $cond: [{ $eq: ["$direction", "out"] }, "$amount", 0] },
          },
        },
      },
    ]),
  ]);
  const totalIncome = incomes[0]?.total ?? 0;
  const totalExpenses = expenses[0]?.total ?? 0;
  const totalTransferIn = transfers[0]?.totalIn ?? 0;
  const totalTransferOut = transfers[0]?.totalOut ?? 0;
  return totalIncome - totalExpenses - totalTransferOut + totalTransferIn;
}

async function buildSummary(cycle) {
  const cycleId = cycle._id;
  const [incomeAgg, expenseAgg, transferAgg] = await Promise.all([
    Income.aggregate([
      { $match: { cycleId } },
      { $group: { _id: "$category", total: { $sum: "$amount" } } },
    ]),
    Expense.aggregate([
      { $match: { cycleId } },
      { $group: { _id: "$category", total: { $sum: "$amount" } } },
    ]),
    Transfer.aggregate([
      { $match: { cycleId } },
      {
        $group: {
          _id: "$category",
          totalIn: {
            $sum: { $cond: [{ $eq: ["$direction", "in"] }, "$amount", 0] },
          },
          totalOut: {
            $sum: { $cond: [{ $eq: ["$direction", "out"] }, "$amount", 0] },
          },
        },
      },
    ]),
  ]);

  const incomeByCategory = {};
  let totalIncome = 0;
  incomeAgg.forEach(({ _id, total }) => {
    incomeByCategory[_id] = total;
    totalIncome += total;
  });

  const expenseByCategory = {};
  let totalExpenses = 0;
  expenseAgg.forEach(({ _id, total }) => {
    expenseByCategory[_id] = total;
    totalExpenses += total;
  });

  // transferByCategory shows outflow per category (the money leaving)
  const transferByCategory = {};
  let totalTransferIn = 0;
  let totalTransferOut = 0;
  transferAgg.forEach(({ _id, totalIn, totalOut }) => {
    if (totalOut > 0) transferByCategory[_id] = totalOut;
    totalTransferIn += totalIn;
    totalTransferOut += totalOut;
  });

  return {
    cycleId,
    label: cycle.label,
    startDate: cycle.startDate,
    endDate: cycle.endDate,
    totalIncome,
    totalExpenses,
    totalTransferOut,
    totalTransferIn,
    netSavings: totalIncome - totalExpenses,
    netCash: totalIncome - totalExpenses - totalTransferOut + totalTransferIn,
    incomeByCategory,
    expenseByCategory,
    transferByCategory,
  };
}

// POST /cycles/open — creates a cycle (first one or a subsequent one).
// Errors if an active cycle already exists; close it first.
exports.openCycle = async (req, res) => {
  const email = req.user.email;
  const { startDate, label, endDate, carryOver } = req.body;

  if (!startDate || !label?.trim()) {
    return res
      .status(400)
      .json({ message: "startDate and label are required." });
  }

  const parsedStart = new Date(startDate);
  if (isNaN(parsedStart.getTime())) {
    return res.status(400).json({ message: "Invalid startDate." });
  }

  let parsedEnd = null;
  if (endDate) {
    parsedEnd = new Date(endDate);
    if (isNaN(parsedEnd.getTime())) {
      return res.status(400).json({ message: "Invalid endDate." });
    }
  }

  try {
    const existingActive = await Cycle.findOne({ email, isActive: true });
    if (existingActive) {
      return res.status(409).json({
        code: "ACTIVE_CYCLE_EXISTS",
        message: "An active cycle already exists. Close it before opening a new one.",
      });
    }

    const newCycle = await Cycle.create({
      email,
      label: label.trim(),
      startDate: parsedStart,
      endDate: parsedEnd,
      isActive: true,
    });

    if (carryOver?.bankBalance) {
      // Carry from the most recently closed cycle. Amount is always
      // server-recomputed — never trusted from the client.
      const lastClosed = await Cycle.findOne({ email, isActive: false }).sort({
        createdAt: -1,
      });
      if (lastClosed) {
        const netCash = await computeNetCash(lastClosed._id);
        if (netCash > 0) {
          await new Income({
            email,
            cycleId: newCycle._id,
            title: `Carry-over from ${lastClosed.label}`,
            amount: netCash,
            category: "carry_over_bank_balance",
            description: `Bank balance carried over from ${lastClosed.label}`,
            date: parsedStart,
          }).save();
        }
      }
    }

    res.status(201).json(newCycle);
  } catch (error) {
    console.error("openCycle failed:", error.message);
    res.status(500).json({ message: "Server Error" });
  }
};

// POST /cycles/close — closes the active cycle. Returns the closed cycle plus
// its computed netCash so the FE can offer carry-over when opening the next one.
exports.closeCycle = async (req, res) => {
  const email = req.user.email;
  const { endDate } = req.body;

  if (!endDate) {
    return res.status(400).json({ message: "endDate is required." });
  }

  const parsedEnd = new Date(endDate);
  if (isNaN(parsedEnd.getTime())) {
    return res.status(400).json({ message: "Invalid endDate." });
  }

  try {
    const activeCycle = await Cycle.findOne({ email, isActive: true });
    if (!activeCycle) {
      return res
        .status(409)
        .json({ code: "NO_ACTIVE_CYCLE", message: "No active cycle to close." });
    }

    const netCash = await computeNetCash(activeCycle._id);

    activeCycle.isActive = false;
    activeCycle.endDate = parsedEnd;
    await activeCycle.save();

    res.status(200).json({ cycle: activeCycle, netCash });
  } catch (error) {
    console.error("closeCycle failed:", error.message);
    res.status(500).json({ message: "Server Error" });
  }
};

// GET /cycles/balance — netCash of the active cycle.
exports.getActiveCycleBalance = async (req, res) => {
  const email = req.user.email;
  try {
    const cycle = await Cycle.findOne({ email, isActive: true });
    if (!cycle) {
      return res
        .status(409)
        .json({ code: "NO_ACTIVE_CYCLE", message: "No active cycle." });
    }
    const netCash = await computeNetCash(cycle._id);
    res.status(200).json({ cycleId: cycle._id, label: cycle.label, netCash });
  } catch (error) {
    console.error("getActiveCycleBalance failed:", error.message);
    res.status(500).json({ message: "Server Error" });
  }
};

// GET /cycles — list all cycles for the user.
exports.listCycles = async (req, res) => {
  const email = req.user.email;
  try {
    const cycles = await Cycle.find({ email })
      .sort({ createdAt: -1 })
      .select("_id label startDate endDate isActive");
    res.status(200).json(cycles);
  } catch (error) {
    console.error("listCycles failed:", error.message);
    res.status(500).json({ message: "Server Error" });
  }
};

// GET /cycles/:id/summary — aggregated totals for one cycle.
exports.getCycleSummary = async (req, res) => {
  const email = req.user.email;
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: "Invalid cycle id." });
  }

  try {
    const cycle = await Cycle.findOne({ _id: id, email });
    if (!cycle) return res.status(404).json({ message: "Cycle not found." });
    const summary = await buildSummary(cycle);
    res.status(200).json(summary);
  } catch (error) {
    console.error("getCycleSummary failed:", error.message);
    res.status(500).json({ message: "Server Error" });
  }
};

// GET /cycles/:id/transactions — raw incomes/expenses/transfers for one cycle.
exports.getCycleTransactions = async (req, res) => {
  const email = req.user.email;
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: "Invalid cycle id." });
  }

  try {
    const cycle = await Cycle.findOne({ _id: id, email });
    if (!cycle) return res.status(404).json({ message: "Cycle not found." });

    const [incomes, expenses, transfers] = await Promise.all([
      Income.find({ cycleId: cycle._id }).sort({ date: 1 }),
      Expense.find({ cycleId: cycle._id }).sort({ date: 1 }),
      Transfer.find({ cycleId: cycle._id }).sort({ date: 1 }),
    ]);

    res.status(200).json({ incomes, expenses, transfers });
  } catch (error) {
    console.error("getCycleTransactions failed:", error.message);
    res.status(500).json({ message: "Server Error" });
  }
};

// Excel sheet names: max 31 chars, no : \ / ? * [ ], and must be unique.
function sanitizeSheetName(label, used) {
  const base =
    (label || "Cycle").replace(/[:\\/?*[\]]/g, " ").trim().slice(0, 31) || "Cycle";
  let candidate = base;
  let n = 1;
  while (used.has(candidate)) {
    const suffix = ` (${++n})`;
    candidate = base.slice(0, 31 - suffix.length) + suffix;
  }
  used.add(candidate);
  return candidate;
}

// GET /cycles/export?n=N — one .xlsx, one sheet per cycle (summary + transactions).
// If n is provided, exports the N most recent cycles; otherwise exports all.
exports.exportCycles = async (req, res) => {
  const email = req.user.email;
  const n = req.query.n ? parseInt(req.query.n, 10) : 0;
  try {
    let cyclesQuery = Cycle.find({ email }).sort({ startDate: -1 });
    if (n > 0) cyclesQuery = cyclesQuery.limit(n);
    const cycles = (await cyclesQuery).reverse(); // chronological order for sheets
    const workbook = new ExcelJS.Workbook();
    const usedNames = new Set();

    if (cycles.length === 0) {
      workbook.addWorksheet("No cycles");
    }

    for (const cycle of cycles) {
      const [incomes, expenses, transfers] = await Promise.all([
        Income.find({ cycleId: cycle._id }).sort({ date: 1 }).lean(),
        Expense.find({ cycleId: cycle._id }).sort({ date: 1 }).lean(),
        Transfer.find({ cycleId: cycle._id }).sort({ date: 1 }).lean(),
      ]);

      const totalIncome = incomes.reduce((s, x) => s + x.amount, 0);
      const totalExpenses = expenses.reduce((s, x) => s + x.amount, 0);
      const totalTransferIn = transfers
        .filter((t) => t.direction === "in")
        .reduce((s, x) => s + x.amount, 0);
      const totalTransferOut = transfers
        .filter((t) => t.direction === "out")
        .reduce((s, x) => s + x.amount, 0);
      const netSavings = totalIncome - totalExpenses;
      const netCash =
        totalIncome - totalExpenses - totalTransferOut + totalTransferIn;

      const sheet = workbook.addWorksheet(sanitizeSheetName(cycle.label, usedNames));

      // Summary block
      sheet.addRow(["Cycle", cycle.label]);
      const startRow = sheet.addRow(["Start date", cycle.startDate]);
      startRow.getCell(2).numFmt = "yyyy-mm-dd";
      const endRow = sheet.addRow(["End date", cycle.endDate || ""]);
      if (cycle.endDate) endRow.getCell(2).numFmt = "yyyy-mm-dd";
      sheet.addRow(["Status", cycle.isActive ? "Active" : "Closed"]);
      sheet.addRow([]);
      sheet.addRow(["Total income", totalIncome]);
      sheet.addRow(["Total expenses", totalExpenses]);
      sheet.addRow(["Total transfer in", totalTransferIn]);
      sheet.addRow(["Total transfer out", totalTransferOut]);
      sheet.addRow(["Net savings", netSavings]);
      sheet.addRow(["Net cash", netCash]);
      sheet.addRow([]);

      // Transactions table
      const header = sheet.addRow([
        "Date",
        "Type",
        "Title",
        "Category",
        "Direction",
        "Amount",
        "Description",
      ]);
      header.font = { bold: true };

      const rows = [
        ...incomes.map((x) => [x.date, "income", x.title, x.category, "", x.amount, x.description || ""]),
        ...expenses.map((x) => [x.date, "expense", x.title, x.category, "", x.amount, x.description || ""]),
        ...transfers.map((x) => [x.date, "transfer", x.title, x.category, x.direction, x.amount, x.description || ""]),
      ].sort((a, b) => new Date(a[0]) - new Date(b[0]));

      rows.forEach((r) => sheet.addRow(r));
      sheet.getColumn(1).numFmt = "yyyy-mm-dd"; // human-readable date cells
    }

    const filename = `xpenz-cycles-${new Date().toISOString().slice(0, 10)}.xlsx`;
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error("exportCycles failed:", error.message);
    if (!res.headersSent) res.status(500).json({ message: "Server Error" });
  }
};

// DELETE /cycles/:id — deletes a cycle and all its transactions.
// The cycle must belong to the requesting user.
exports.deleteCycle = async (req, res) => {
  const email = req.user.email;
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: "Invalid cycle id." });
  }

  try {
    const cycle = await Cycle.findOne({ _id: id, email });
    if (!cycle) return res.status(404).json({ message: "Cycle not found." });

    await Promise.all([
      Income.deleteMany({ cycleId: cycle._id }),
      Expense.deleteMany({ cycleId: cycle._id }),
      Transfer.deleteMany({ cycleId: cycle._id }),
    ]);
    await Cycle.deleteOne({ _id: cycle._id });

    res.status(200).json({ message: "Cycle deleted." });
  } catch (error) {
    console.error("deleteCycle failed:", error.message);
    res.status(500).json({ message: "Server Error" });
  }
};

// GET /cycles/compare?ids=a,b,c — summaries for the requested cycles.
exports.compareCycles = async (req, res) => {
  const email = req.user.email;
  const { ids } = req.query;

  if (!ids) {
    return res.status(400).json({ message: "ids query param required." });
  }

  const idList = ids
    .split(",")
    .map((s) => s.trim())
    .filter((s) => mongoose.Types.ObjectId.isValid(s));

  if (idList.length === 0) {
    return res.status(400).json({ message: "No valid cycle ids provided." });
  }

  try {
    const cycles = await Cycle.find({ _id: { $in: idList }, email });
    const summaries = await Promise.all(cycles.map(buildSummary));
    res.status(200).json(summaries);
  } catch (error) {
    console.error("compareCycles failed:", error.message);
    res.status(500).json({ message: "Server Error" });
  }
};
