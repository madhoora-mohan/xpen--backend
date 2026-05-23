const { describe, it, expect, beforeEach } = require("bun:test");
const request = require("supertest");
const app = require("../app");

const makeUser = (email = "test@example.com") => ({
  username: "testuser",
  email,
  password: "Test@12345!",
});

const getAuthAgent = async (email = "test@example.com") => {
  const agent = request.agent(app);
  await agent.post("/api/users").send(makeUser(email));
  return agent;
};

const validIncome = {
  title: "Salary",
  amount: 5000,
  date: new Date().toISOString(),
  category: "salary",
  description: "",
};

const validExpense = {
  title: "Lunch",
  amount: 200,
  date: new Date().toISOString(),
  category: "food",
  description: "",
};

const validTransfer = {
  title: "Loan to friend",
  amount: 1000,
  date: new Date().toISOString(),
  category: "lending_money",
  description: "",
  direction: "out",
};

// ── Unauthenticated access ──────────────────────────────────────────────────

describe("Unauthenticated access", () => {
  const protectedRoutes = [
    ["GET", "/api/v1/get-incomes"],
    ["GET", "/api/v1/get-expenses"],
    ["GET", "/api/v1/get-transfers"],
    ["POST", "/api/v1/add-income"],
    ["POST", "/api/v1/add-expense"],
    ["POST", "/api/v1/add-transfer"],
  ];

  protectedRoutes.forEach(([method, route]) => {
    it(`${method} ${route} returns 401 without a cookie`, async () => {
      const res = await request(app)[method.toLowerCase()](route);
      expect(res.status).toBe(401);
      expect(res.body.code).toBe("NO_TOKEN");
    });
  });
});

// ── Amount validation ───────────────────────────────────────────────────────

describe("Amount validation", () => {
  let agent;
  beforeEach(async () => {
    agent = await getAuthAgent();
  });

  it("rejects a negative income amount", async () => {
    const res = await agent
      .post("/api/v1/add-income")
      .send({ ...validIncome, amount: -1 });
    expect(res.status).toBe(400);
  });

  it("rejects zero as an expense amount", async () => {
    const res = await agent
      .post("/api/v1/add-expense")
      .send({ ...validExpense, amount: 0 });
    expect(res.status).toBe(400);
  });

  it("rejects a string amount for a transfer", async () => {
    const res = await agent
      .post("/api/v1/add-transfer")
      .send({ ...validTransfer, amount: "abc" });
    expect(res.status).toBe(400);
  });
});

// ── Income CRUD ─────────────────────────────────────────────────────────────

describe("Income", () => {
  let agent;
  beforeEach(async () => {
    agent = await getAuthAgent();
  });

  it("adds an income and returns it in the list", async () => {
    await agent.post("/api/v1/add-income").send(validIncome);
    const res = await agent.get("/api/v1/get-incomes");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].title).toBe(validIncome.title);
    expect(res.body[0].amount).toBe(validIncome.amount);
  });

  it("deletes an income", async () => {
    await agent.post("/api/v1/add-income").send(validIncome);
    const list = await agent.get("/api/v1/get-incomes");
    const id = list.body[0]._id;
    const del = await agent.delete(`/api/v1/delete-income/${id}`);
    expect(del.status).toBe(200);
    const after = await agent.get("/api/v1/get-incomes");
    expect(after.body).toHaveLength(0);
  });
});

// ── Expense CRUD ────────────────────────────────────────────────────────────

describe("Expense", () => {
  let agent;
  beforeEach(async () => {
    agent = await getAuthAgent();
  });

  it("adds an expense and returns it in the list", async () => {
    await agent.post("/api/v1/add-expense").send(validExpense);
    const res = await agent.get("/api/v1/get-expenses");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].title).toBe(validExpense.title);
  });
});

// ── Data scoping ────────────────────────────────────────────────────────────

describe("Data scoping", () => {
  it("user A cannot see user B's income", async () => {
    const agentA = await getAuthAgent("a@example.com");
    const agentB = await getAuthAgent("b@example.com");

    await agentA.post("/api/v1/add-income").send(validIncome);

    const res = await agentB.get("/api/v1/get-incomes");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(0);
  });

  it("user A cannot see user B's expenses", async () => {
    const agentA = await getAuthAgent("a@example.com");
    const agentB = await getAuthAgent("b@example.com");

    await agentA.post("/api/v1/add-expense").send(validExpense);

    const res = await agentB.get("/api/v1/get-expenses");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(0);
  });
});

