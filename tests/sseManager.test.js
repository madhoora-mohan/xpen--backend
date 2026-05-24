const { describe, it, expect } = require("bun:test");
const { addClient, removeClient, emit } = require("../middleware/sseManager");

// Helper — a fake response object that just records what was written to it
const mockRes = () => {
  const writes = [];
  return { res: { write: (data) => writes.push(data) }, writes };
};

describe("sseManager — emit with no clients", () => {
  it("does not throw when no clients are registered for that email", () => {
    expect(() => emit("nobody@example.com", "income_changed", {})).not.toThrow();
  });
});

describe("sseManager — addClient / emit / removeClient", () => {
  it("emit writes the event name and data to a registered client", () => {
    const { res, writes } = mockRes();

    addClient("user@example.com", res);
    emit("user@example.com", "income_changed", { action: "add" });
    removeClient("user@example.com", res);

    expect(writes).toHaveLength(1);
    expect(writes[0]).toContain("event: income_changed");
    expect(writes[0]).toContain('"action":"add"');
  });

  it("emit sends to all connected clients for the same email", () => {
    const { res: res1, writes: writes1 } = mockRes();
    const { res: res2, writes: writes2 } = mockRes();

    addClient("multi@example.com", res1);
    addClient("multi@example.com", res2);
    emit("multi@example.com", "expense_changed", { action: "delete" });
    removeClient("multi@example.com", res1);
    removeClient("multi@example.com", res2);

    expect(writes1).toHaveLength(1);
    expect(writes2).toHaveLength(1);
    expect(writes1[0]).toContain("expense_changed");
    expect(writes2[0]).toContain("expense_changed");
  });

  it("emit does not send to clients registered under a different email", () => {
    const { res: resA, writes: writesA } = mockRes();
    const { res: resB, writes: writesB } = mockRes();

    addClient("a@example.com", resA);
    addClient("b@example.com", resB);
    emit("a@example.com", "income_changed", { action: "add" });
    removeClient("a@example.com", resA);
    removeClient("b@example.com", resB);

    expect(writesA).toHaveLength(1);
    expect(writesB).toHaveLength(0);
  });

  it("removeClient stops that client from receiving further events", () => {
    const { res, writes } = mockRes();

    addClient("gone@example.com", res);
    removeClient("gone@example.com", res);
    emit("gone@example.com", "income_changed", { action: "add" });

    expect(writes).toHaveLength(0);
  });

  it("payload follows the SSE wire format — event line, data line, blank line", () => {
    const { res, writes } = mockRes();

    addClient("format@example.com", res);
    emit("format@example.com", "transfer_changed", { action: "add" });
    removeClient("format@example.com", res);

    const payload = writes[0];
    expect(payload).toBe(
      `event: transfer_changed\ndata: ${JSON.stringify({ action: "add" })}\n\n`
    );
  });

});
