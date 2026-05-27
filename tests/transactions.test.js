const { describe, it, expect, beforeEach, afterEach } = require("bun:test");
const request = require("supertest");
const app = require("../app");
const { addClient, removeClient } = require("../middleware/sseManager");

const makeUser = (email = "test@example.com") => ({
  username: "testuser",
  email,
  password: "Test@12345!",
});

const getAuthAgent = async (email = "test@example.com") => {
  const agent = request.agent(app);
  await agent.post("/api/users").send(makeUser(email));
  // Every user needs an active cycle before they can log transactions.
  await agent.post("/api/v1/cycles/open").send({
    startDate: new Date().toISOString(),
    label: "Test Cycle",
  });
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
    ["GET", "/api/v1/events"],
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

// ── SSE — emit fires after writes ───────────────────────────────────────────
//
// Rather than opening a real SSE HTTP connection (which never closes and would
// hang supertest), we register a mock client directly in the sseManager and
// verify it receives the right writes after each mutation request.

describe("SSE emit — income", () => {
  let agent;
  let writes;
  const email = "sse-income@example.com";

  beforeEach(async () => {
    writes = [];
    agent = await getAuthAgent(email);
    addClient(email, { write: (d) => writes.push(d) });
  });

  afterEach(() => {
    removeClient(email, { write: () => {} });
  });

  it("emits income_changed with action:add after adding an income", async () => {
    await agent.post("/api/v1/add-income").send(validIncome);
    expect(writes.some((w) => w.includes("income_changed"))).toBe(true);
    expect(writes.some((w) => w.includes('"action":"add"'))).toBe(true);
  });

  it("emits income_changed with action:delete after deleting an income", async () => {
    await agent.post("/api/v1/add-income").send(validIncome);
    writes.length = 0;
    const list = await agent.get("/api/v1/get-incomes");
    await agent.delete(`/api/v1/delete-income/${list.body[0]._id}`);
    expect(writes.some((w) => w.includes("income_changed"))).toBe(true);
    expect(writes.some((w) => w.includes('"action":"delete"'))).toBe(true);
  });

});

describe("SSE emit — expense", () => {
  let agent;
  let writes;
  const email = "sse-expense@example.com";

  beforeEach(async () => {
    writes = [];
    agent = await getAuthAgent(email);
    addClient(email, { write: (d) => writes.push(d) });
  });

  afterEach(() => {
    removeClient(email, { write: () => {} });
  });

  it("emits expense_changed with action:add after adding an expense", async () => {
    await agent.post("/api/v1/add-expense").send(validExpense);
    expect(writes.some((w) => w.includes("expense_changed"))).toBe(true);
    expect(writes.some((w) => w.includes('"action":"add"'))).toBe(true);
  });

  it("emits expense_changed with action:delete after deleting an expense", async () => {
    await agent.post("/api/v1/add-expense").send(validExpense);
    writes.length = 0;
    const list = await agent.get("/api/v1/get-expenses");
    await agent.delete(`/api/v1/delete-expense/${list.body[0]._id}`);
    expect(writes.some((w) => w.includes("expense_changed"))).toBe(true);
    expect(writes.some((w) => w.includes('"action":"delete"'))).toBe(true);
  });
});

describe("SSE emit — transfer", () => {
  let agent;
  let writes;
  const email = "sse-transfer@example.com";

  beforeEach(async () => {
    writes = [];
    agent = await getAuthAgent(email);
    addClient(email, { write: (d) => writes.push(d) });
  });

  afterEach(() => {
    removeClient(email, { write: () => {} });
  });

  it("emits transfer_changed with action:add after adding a transfer", async () => {
    await agent.post("/api/v1/add-transfer").send(validTransfer);
    expect(writes.some((w) => w.includes("transfer_changed"))).toBe(true);
    expect(writes.some((w) => w.includes('"action":"add"'))).toBe(true);
  });

  it("emits transfer_changed with action:delete after deleting a transfer", async () => {
    await agent.post("/api/v1/add-transfer").send(validTransfer);
    writes.length = 0;
    const list = await agent.get("/api/v1/get-transfers");
    await agent.delete(`/api/v1/delete-transfer/${list.body[0]._id}`);
    expect(writes.some((w) => w.includes("transfer_changed"))).toBe(true);
    expect(writes.some((w) => w.includes('"action":"delete"'))).toBe(true);
  });
});

// ── SSE — emit NOT fired on validation failures ──────────────────────────────
//
// emit lives inside the try block after save(), so any request that fails
// validation before reaching the DB should not trigger an SSE event.

describe("SSE emit — not fired on failed mutations", () => {
  let agent;
  let writes;
  const email = "sse-fail@example.com";

  beforeEach(async () => {
    writes = [];
    agent = await getAuthAgent(email);
    addClient(email, { write: (d) => writes.push(d) });
  });

  afterEach(() => {
    removeClient(email, { write: () => {} });
  });

  it("does not emit when add-income fails validation", async () => {
    await agent.post("/api/v1/add-income").send({ ...validIncome, amount: -1 });
    expect(writes).toHaveLength(0);
  });

  it("does not emit when add-expense fails validation", async () => {
    await agent.post("/api/v1/add-expense").send({ ...validExpense, amount: 0 });
    expect(writes).toHaveLength(0);
  });

  it("does not emit when add-transfer fails validation", async () => {
    await agent
      .post("/api/v1/add-transfer")
      .send({ ...validTransfer, direction: "sideways" });
    expect(writes).toHaveLength(0);
  });
});

// ── CORS ─────────────────────────────────────────────────────────────────────

describe("CORS", () => {
  it("allows requests from localhost:3000", async () => {
    const res = await request(app)
      .get("/api/v1/get-incomes")
      .set("Origin", "http://localhost:3000");
    expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:3000");
  });

  it("allows requests from a 192.168.x.x LAN IP on port 3000", async () => {
    const res = await request(app)
      .get("/api/v1/get-incomes")
      .set("Origin", "http://192.168.1.100:3000");
    expect(res.headers["access-control-allow-origin"]).toBe("http://192.168.1.100:3000");
  });

  it("allows requests from a 10.x.x.x LAN IP on port 3000", async () => {
    const res = await request(app)
      .get("/api/v1/get-incomes")
      .set("Origin", "http://10.0.0.5:3000");
    expect(res.headers["access-control-allow-origin"]).toBe("http://10.0.0.5:3000");
  });

  it("does not set ACAO header for an unlisted origin", async () => {
    const res = await request(app)
      .get("/api/v1/get-incomes")
      .set("Origin", "http://evil.com");
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("does not allow a LAN IP on the wrong port", async () => {
    const res = await request(app)
      .get("/api/v1/get-incomes")
      .set("Origin", "http://192.168.1.100:9999");
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });
});

