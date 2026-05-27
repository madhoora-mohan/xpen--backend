const { describe, it, expect, beforeEach } = require("bun:test");
const request = require("supertest");
const ExcelJS = require("exceljs");
const app = require("../app");

// supertest: collect a binary response body into a Buffer.
const asBuffer = (req) =>
  req.buffer().parse((res, cb) => {
    const chunks = [];
    res.on("data", (c) => chunks.push(c));
    res.on("end", () => cb(null, Buffer.concat(chunks)));
  });

const makeUser = (email = "cyc@example.com") => ({
  username: "cycuser",
  email,
  password: "Test@12345!",
});

// Signs up a user but does NOT open a cycle — for testing the gate.
const getRawAgent = async (email = "cyc@example.com") => {
  const agent = request.agent(app);
  await agent.post("/api/users").send(makeUser(email));
  return agent;
};

// Signs up and opens an active cycle.
const getAgentWithCycle = async (email = "cyc@example.com", label = "May 2026") => {
  const agent = await getRawAgent(email);
  await agent.post("/api/v1/cycles/open").send({
    startDate: "2026-05-01T00:00:00.000Z",
    label,
  });
  return agent;
};

const income = (over = {}) => ({
  title: "Salary",
  amount: 5000,
  date: "2026-05-05T00:00:00.000Z",
  category: "salary",
  description: "",
  ...over,
});

const expense = (over = {}) => ({
  title: "Rent",
  amount: 2000,
  date: "2026-05-05T00:00:00.000Z",
  category: "rent",
  description: "",
  ...over,
});

const transfer = (over = {}) => ({
  title: "Lend",
  amount: 500,
  date: "2026-05-05T00:00:00.000Z",
  category: "lending_money",
  description: "",
  direction: "out",
  ...over,
});

// ── Unauthenticated access ──────────────────────────────────────────────────

describe("Cycles — unauthenticated", () => {
  const routes = [
    ["POST", "/api/v1/cycles/open"],
    ["POST", "/api/v1/cycles/close"],
    ["GET", "/api/v1/cycles"],
    ["GET", "/api/v1/cycles/balance"],
    ["GET", "/api/v1/cycles/compare?ids=abc"],
    ["DELETE", "/api/v1/cycles/507f1f77bcf86cd799439011"],
  ];

  routes.forEach(([method, route]) => {
    it(`${method} ${route} returns 401 without a cookie`, async () => {
      const res = await request(app)[method.toLowerCase()](route);
      expect(res.status).toBe(401);
      expect(res.body.code).toBe("NO_TOKEN");
    });
  });
});

// ── NO_ACTIVE_CYCLE gate ─────────────────────────────────────────────────────

describe("NO_ACTIVE_CYCLE gate", () => {
  let agent;
  beforeEach(async () => {
    agent = await getRawAgent();
  });

  it("blocks add-income with 409 when no active cycle", async () => {
    const res = await agent.post("/api/v1/add-income").send(income());
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("NO_ACTIVE_CYCLE");
  });

  it("blocks get-incomes with 409 when no active cycle", async () => {
    const res = await agent.get("/api/v1/get-incomes");
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("NO_ACTIVE_CYCLE");
  });

  it("blocks get-expenses and get-transfers with 409", async () => {
    expect((await agent.get("/api/v1/get-expenses")).status).toBe(409);
    expect((await agent.get("/api/v1/get-transfers")).status).toBe(409);
  });

  it("returns 409 NO_ACTIVE_CYCLE on /cycles/balance with no cycle", async () => {
    const res = await agent.get("/api/v1/cycles/balance");
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("NO_ACTIVE_CYCLE");
  });

  it("returns 409 NO_ACTIVE_CYCLE on /cycles/close with no cycle", async () => {
    const res = await agent
      .post("/api/v1/cycles/close")
      .send({ endDate: "2026-05-31T00:00:00.000Z" });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("NO_ACTIVE_CYCLE");
  });
});

// ── POST /cycles/open ────────────────────────────────────────────────────────

describe("POST /cycles/open", () => {
  let agent;
  beforeEach(async () => {
    agent = await getRawAgent();
  });

  it("creates the first cycle and returns 201 with isActive true", async () => {
    const res = await agent
      .post("/api/v1/cycles/open")
      .send({ startDate: "2026-05-01T00:00:00.000Z", label: "May 2026" });
    expect(res.status).toBe(201);
    expect(res.body.label).toBe("May 2026");
    expect(res.body.isActive).toBe(true);
    expect(res.body.endDate).toBeNull();
  });

  it("requires startDate and label", async () => {
    expect(
      (await agent.post("/api/v1/cycles/open").send({ label: "x" })).status
    ).toBe(400);
    expect(
      (await agent.post("/api/v1/cycles/open").send({ startDate: "2026-05-01" })).status
    ).toBe(400);
  });

  it("rejects an invalid startDate", async () => {
    const res = await agent
      .post("/api/v1/cycles/open")
      .send({ startDate: "not-a-date", label: "May 2026" });
    expect(res.status).toBe(400);
  });

  it("stores an optional endDate when provided", async () => {
    const res = await agent.post("/api/v1/cycles/open").send({
      startDate: "2026-05-01T00:00:00.000Z",
      label: "May 2026",
      endDate: "2026-05-31T00:00:00.000Z",
    });
    expect(res.status).toBe(201);
    expect(new Date(res.body.endDate).toISOString()).toBe("2026-05-31T00:00:00.000Z");
    expect(res.body.isActive).toBe(true);
  });

  it("returns 409 ACTIVE_CYCLE_EXISTS when one is already active", async () => {
    await agent
      .post("/api/v1/cycles/open")
      .send({ startDate: "2026-05-01T00:00:00.000Z", label: "May 2026" });
    const res = await agent
      .post("/api/v1/cycles/open")
      .send({ startDate: "2026-06-01T00:00:00.000Z", label: "June 2026" });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("ACTIVE_CYCLE_EXISTS");
  });
});

// ── POST /cycles/close ───────────────────────────────────────────────────────

describe("POST /cycles/close", () => {
  let agent;
  beforeEach(async () => {
    agent = await getAgentWithCycle();
  });

  it("requires endDate", async () => {
    const res = await agent.post("/api/v1/cycles/close").send({});
    expect(res.status).toBe(400);
  });

  it("closes the active cycle and returns computed netCash", async () => {
    await agent.post("/api/v1/add-income").send(income({ amount: 5000 }));
    await agent.post("/api/v1/add-expense").send(expense({ amount: 2000 }));
    await agent.post("/api/v1/add-transfer").send(transfer({ amount: 500 }));

    const res = await agent
      .post("/api/v1/cycles/close")
      .send({ endDate: "2026-05-31T00:00:00.000Z" });

    expect(res.status).toBe(200);
    expect(res.body.cycle.isActive).toBe(false);
    // 5000 - 2000 - 500 (out) + 0 (in) = 2500
    expect(res.body.netCash).toBe(2500);
  });

  it("leaves the user with no active cycle after closing", async () => {
    await agent.post("/api/v1/cycles/close").send({ endDate: "2026-05-31T00:00:00.000Z" });
    const res = await agent.get("/api/v1/get-incomes");
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("NO_ACTIVE_CYCLE");
  });
});

// ── Carry-over on open ───────────────────────────────────────────────────────

describe("Carry-over via close then open", () => {
  let agent;
  beforeEach(async () => {
    agent = await getAgentWithCycle("carry@example.com", "May 2026");
  });

  it("creates a carry-over income in the new cycle when netCash > 0", async () => {
    await agent.post("/api/v1/add-income").send(income({ amount: 5000 }));
    await agent.post("/api/v1/add-expense").send(expense({ amount: 2000 }));

    await agent.post("/api/v1/cycles/close").send({ endDate: "2026-05-31T00:00:00.000Z" });
    await agent.post("/api/v1/cycles/open").send({
      startDate: "2026-06-01T00:00:00.000Z",
      label: "June 2026",
      carryOver: { bankBalance: true },
    });

    const res = await agent.get("/api/v1/get-incomes");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].category).toBe("carry_over_bank_balance");
    expect(res.body[0].amount).toBe(3000); // 5000 - 2000
    expect(res.body[0].title).toBe("Carry-over from May 2026");
  });

  it("skips carry-over when netCash <= 0", async () => {
    await agent.post("/api/v1/add-income").send(income({ amount: 1000 }));
    await agent.post("/api/v1/add-expense").send(expense({ amount: 2000 }));

    await agent.post("/api/v1/cycles/close").send({ endDate: "2026-05-31T00:00:00.000Z" });
    await agent.post("/api/v1/cycles/open").send({
      startDate: "2026-06-01T00:00:00.000Z",
      label: "June 2026",
      carryOver: { bankBalance: true },
    });

    const res = await agent.get("/api/v1/get-incomes");
    expect(res.body).toHaveLength(0);
  });

  it("does not carry over when carryOver is omitted", async () => {
    await agent.post("/api/v1/add-income").send(income({ amount: 5000 }));
    await agent.post("/api/v1/cycles/close").send({ endDate: "2026-05-31T00:00:00.000Z" });
    await agent.post("/api/v1/cycles/open").send({
      startDate: "2026-06-01T00:00:00.000Z",
      label: "June 2026",
    });

    const res = await agent.get("/api/v1/get-incomes");
    expect(res.body).toHaveLength(0);
  });
});

// ── GET /cycles ──────────────────────────────────────────────────────────────

describe("GET /cycles", () => {
  it("lists cycles newest-first with metadata only", async () => {
    const agent = await getAgentWithCycle("list@example.com", "May 2026");
    await agent.post("/api/v1/cycles/close").send({ endDate: "2026-05-31T00:00:00.000Z" });
    await agent.post("/api/v1/cycles/open").send({
      startDate: "2026-06-01T00:00:00.000Z",
      label: "June 2026",
    });

    const res = await agent.get("/api/v1/cycles");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].label).toBe("June 2026"); // newest first
    expect(res.body[0].isActive).toBe(true);
    expect(res.body[1].isActive).toBe(false);
  });
});

// ── GET /cycles/balance ──────────────────────────────────────────────────────

describe("GET /cycles/balance", () => {
  it("returns netCash for the active cycle", async () => {
    const agent = await getAgentWithCycle("bal@example.com");
    await agent.post("/api/v1/add-income").send(income({ amount: 4000 }));
    await agent.post("/api/v1/add-expense").send(expense({ amount: 1000 }));

    const res = await agent.get("/api/v1/cycles/balance");
    expect(res.status).toBe(200);
    expect(res.body.netCash).toBe(3000);
    expect(res.body.label).toBe("May 2026");
  });
});

// ── GET /cycles/:id/summary ──────────────────────────────────────────────────

describe("GET /cycles/:id/summary", () => {
  let agent;
  let cycleId;
  beforeEach(async () => {
    agent = await getAgentWithCycle("sum@example.com");
    const list = await agent.get("/api/v1/cycles");
    cycleId = list.body[0]._id;
  });

  it("returns aggregated totals and category breakdowns", async () => {
    await agent.post("/api/v1/add-income").send(income({ amount: 5000, category: "salary" }));
    await agent.post("/api/v1/add-expense").send(expense({ amount: 2000, category: "rent" }));
    await agent.post("/api/v1/add-expense").send(expense({ amount: 800, category: "food" }));
    await agent.post("/api/v1/add-transfer").send(transfer({ amount: 500, category: "lending_money", direction: "out" }));

    const res = await agent.get(`/api/v1/cycles/${cycleId}/summary`);
    expect(res.status).toBe(200);
    expect(res.body.totalIncome).toBe(5000);
    expect(res.body.totalExpenses).toBe(2800);
    expect(res.body.totalTransferOut).toBe(500);
    expect(res.body.netSavings).toBe(2200); // income - expenses
    expect(res.body.netCash).toBe(1700); // 5000 - 2800 - 500
    expect(res.body.incomeByCategory.salary).toBe(5000);
    expect(res.body.expenseByCategory.rent).toBe(2000);
    expect(res.body.expenseByCategory.food).toBe(800);
    expect(res.body.transferByCategory.lending_money).toBe(500);
  });

  it("returns 400 for an invalid id", async () => {
    const res = await agent.get("/api/v1/cycles/not-an-id/summary");
    expect(res.status).toBe(400);
  });

  it("returns 404 for a non-existent cycle", async () => {
    const res = await agent.get("/api/v1/cycles/507f1f77bcf86cd799439011/summary");
    expect(res.status).toBe(404);
  });

  it("does not expose another user's cycle summary", async () => {
    const other = await getAgentWithCycle("other@example.com");
    const res = await other.get(`/api/v1/cycles/${cycleId}/summary`);
    expect(res.status).toBe(404);
  });
});

// ── GET /cycles/:id/transactions ─────────────────────────────────────────────

describe("GET /cycles/:id/transactions", () => {
  let agent;
  let cycleId;
  beforeEach(async () => {
    agent = await getAgentWithCycle("txns@example.com");
    cycleId = (await agent.get("/api/v1/cycles")).body[0]._id;
  });

  it("returns incomes, expenses and transfers for the cycle", async () => {
    await agent.post("/api/v1/add-income").send(income({ amount: 5000 }));
    await agent.post("/api/v1/add-expense").send(expense({ amount: 2000 }));
    await agent.post("/api/v1/add-transfer").send(transfer({ amount: 500 }));

    const res = await agent.get(`/api/v1/cycles/${cycleId}/transactions`);
    expect(res.status).toBe(200);
    expect(res.body.incomes).toHaveLength(1);
    expect(res.body.expenses).toHaveLength(1);
    expect(res.body.transfers).toHaveLength(1);
    expect(res.body.incomes[0].amount).toBe(5000);
  });

  it("still returns a closed cycle's transactions", async () => {
    await agent.post("/api/v1/add-income").send(income({ amount: 5000 }));
    await agent.post("/api/v1/cycles/close").send({ endDate: "2026-05-31T00:00:00.000Z" });

    const res = await agent.get(`/api/v1/cycles/${cycleId}/transactions`);
    expect(res.status).toBe(200);
    expect(res.body.incomes).toHaveLength(1);
  });

  it("returns 400 for an invalid id", async () => {
    const res = await agent.get("/api/v1/cycles/not-an-id/transactions");
    expect(res.status).toBe(400);
  });

  it("returns 404 for a non-existent cycle", async () => {
    const res = await agent.get("/api/v1/cycles/507f1f77bcf86cd799439011/transactions");
    expect(res.status).toBe(404);
  });

  it("does not expose another user's cycle transactions", async () => {
    const other = await getAgentWithCycle("txns-other@example.com");
    const res = await other.get(`/api/v1/cycles/${cycleId}/transactions`);
    expect(res.status).toBe(404);
  });
});

// ── GET /cycles/export ───────────────────────────────────────────────────────

describe("GET /cycles/export", () => {
  it("streams an xlsx with one sheet per cycle, each holding its transactions", async () => {
    const agent = await getAgentWithCycle("exp@example.com", "May 2026");
    await agent.post("/api/v1/add-income").send(income({ amount: 5000 }));
    await agent.post("/api/v1/cycles/close").send({ endDate: "2026-05-31T00:00:00.000Z" });
    await agent.post("/api/v1/cycles/open").send({
      startDate: "2026-06-01T00:00:00.000Z",
      label: "June 2026",
    });

    const res = await asBuffer(agent.get("/api/v1/cycles/export"));
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("spreadsheetml");
    expect(res.headers["content-disposition"]).toContain("attachment");

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.body);
    const names = wb.worksheets.map((w) => w.name);
    expect(names).toEqual(["May 2026", "June 2026"]); // chronological order

    // May sheet should contain the income row somewhere
    const maySheet = wb.getWorksheet("May 2026");
    let found = false;
    maySheet.eachRow((row) => {
      if (row.values.includes("Salary")) found = true;
    });
    expect(found).toBe(true);
  });

  it("produces a workbook even when the user has no cycles", async () => {
    const agent = await getRawAgent("exp-empty@example.com");
    const res = await asBuffer(agent.get("/api/v1/cycles/export"));
    expect(res.status).toBe(200);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.body);
    expect(wb.worksheets.length).toBe(1);
  });
});

// ── GET /cycles/compare ──────────────────────────────────────────────────────

describe("GET /cycles/compare", () => {
  it("returns summaries for multiple cycles", async () => {
    const agent = await getAgentWithCycle("cmp@example.com", "May 2026");
    const first = (await agent.get("/api/v1/cycles")).body[0]._id;
    await agent.post("/api/v1/cycles/close").send({ endDate: "2026-05-31T00:00:00.000Z" });
    await agent.post("/api/v1/cycles/open").send({
      startDate: "2026-06-01T00:00:00.000Z",
      label: "June 2026",
    });
    const second = (await agent.get("/api/v1/cycles")).body[0]._id;

    const res = await agent.get(`/api/v1/cycles/compare?ids=${first},${second}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });

  it("returns 400 when ids param is missing", async () => {
    const agent = await getAgentWithCycle("cmp2@example.com");
    const res = await agent.get("/api/v1/cycles/compare");
    expect(res.status).toBe(400);
  });

  it("accepts more than 6 ids (no cap)", async () => {
    const agent = await getAgentWithCycle("cmp3@example.com");
    const ids = Array.from({ length: 8 }, () => "507f1f77bcf86cd799439011").join(",");
    const res = await agent.get(`/api/v1/cycles/compare?ids=${ids}`);
    expect(res.status).toBe(200);
    // none of those ids belong to this user, so the result is empty — but not rejected
    expect(res.body).toHaveLength(0);
  });

  it("only returns the requesting user's cycles", async () => {
    const agentA = await getAgentWithCycle("a-cmp@example.com");
    const aId = (await agentA.get("/api/v1/cycles")).body[0]._id;
    const agentB = await getAgentWithCycle("b-cmp@example.com");

    const res = await agentB.get(`/api/v1/cycles/compare?ids=${aId}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(0);
  });
});

// ── DELETE /cycles/:id ───────────────────────────────────────────────────────

describe("DELETE /cycles/:id", () => {
  it("deletes the cycle and returns 200", async () => {
    const agent = await getAgentWithCycle("del@example.com");
    const id = (await agent.get("/api/v1/cycles")).body[0]._id;

    const res = await agent.delete(`/api/v1/cycles/${id}`);
    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Cycle deleted.");

    const list = await agent.get("/api/v1/cycles");
    expect(list.body).toHaveLength(0);
  });

  it("cascade-deletes all transactions belonging to the cycle", async () => {
    const agent = await getAgentWithCycle("del-cascade@example.com");
    await agent.post("/api/v1/add-income").send(income({ amount: 5000 }));
    await agent.post("/api/v1/add-expense").send(expense({ amount: 2000 }));
    await agent.post("/api/v1/add-transfer").send(transfer({ amount: 500 }));

    const id = (await agent.get("/api/v1/cycles")).body[0]._id;
    await agent.delete(`/api/v1/cycles/${id}`);

    // After deleting, open a fresh cycle so the transaction endpoints are reachable.
    await agent.post("/api/v1/cycles/open").send({
      startDate: "2026-06-01T00:00:00.000Z",
      label: "June 2026",
    });
    expect((await agent.get("/api/v1/get-incomes")).body).toHaveLength(0);
    expect((await agent.get("/api/v1/get-expenses")).body).toHaveLength(0);
    expect((await agent.get("/api/v1/get-transfers")).body).toHaveLength(0);
  });

  it("deleting the active cycle leaves the user with no active cycle", async () => {
    const agent = await getAgentWithCycle("del-gate@example.com");
    const id = (await agent.get("/api/v1/cycles")).body[0]._id;
    await agent.delete(`/api/v1/cycles/${id}`);

    const res = await agent.get("/api/v1/cycles/balance");
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("NO_ACTIVE_CYCLE");
  });

  it("can also delete a closed cycle", async () => {
    const agent = await getAgentWithCycle("del-closed@example.com", "May 2026");
    const mayId = (await agent.get("/api/v1/cycles")).body[0]._id;
    await agent.post("/api/v1/cycles/close").send({ endDate: "2026-05-31T00:00:00.000Z" });
    await agent.post("/api/v1/cycles/open").send({
      startDate: "2026-06-01T00:00:00.000Z",
      label: "June 2026",
    });

    const res = await agent.delete(`/api/v1/cycles/${mayId}`);
    expect(res.status).toBe(200);

    const list = await agent.get("/api/v1/cycles");
    expect(list.body).toHaveLength(1);
    expect(list.body[0].label).toBe("June 2026");
  });

  it("returns 400 for an invalid id", async () => {
    const agent = await getAgentWithCycle("del-badid@example.com");
    const res = await agent.delete("/api/v1/cycles/not-an-id");
    expect(res.status).toBe(400);
  });

  it("returns 404 for a non-existent cycle", async () => {
    const agent = await getAgentWithCycle("del-404@example.com");
    const res = await agent.delete("/api/v1/cycles/507f1f77bcf86cd799439011");
    expect(res.status).toBe(404);
  });

  it("cannot delete another user's cycle", async () => {
    const agentA = await getAgentWithCycle("del-a@example.com");
    const aId = (await agentA.get("/api/v1/cycles")).body[0]._id;
    const agentB = await getAgentWithCycle("del-b@example.com");

    const res = await agentB.delete(`/api/v1/cycles/${aId}`);
    expect(res.status).toBe(404);

    // Original cycle is untouched.
    const list = await agentA.get("/api/v1/cycles");
    expect(list.body).toHaveLength(1);
  });
});
