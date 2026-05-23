const { describe, it, expect, beforeEach } = require("bun:test");
const request = require("supertest");
const app = require("../app");

const validUser = {
  username: "testuser",
  email: "test@example.com",
  password: "Test@12345!",
};

describe("POST /api/users — registration", () => {
  it("returns 400 when required fields are missing", async () => {
    const res = await request(app)
      .post("/api/users")
      .send({ email: "test@example.com" });
    expect(res.status).toBe(400);
  });

  it("returns 400 for a weak password", async () => {
    const res = await request(app)
      .post("/api/users")
      .send({ ...validUser, password: "weak" });
    expect(res.status).toBe(400);
  });

  it("returns 201 and sets an httpOnly cookie on success", async () => {
    const res = await request(app).post("/api/users").send(validUser);
    expect(res.status).toBe(201);
    expect(res.headers["set-cookie"]).toBeDefined();
    expect(res.body.email).toBe(validUser.email);
  });

  it("returns 409 on duplicate email", async () => {
    await request(app).post("/api/users").send(validUser);
    const res = await request(app).post("/api/users").send(validUser);
    expect(res.status).toBe(409);
  });
});

describe("POST /api/auth — login", () => {
  beforeEach(async () => {
    await request(app).post("/api/users").send(validUser);
  });

  it("returns 401 for a nonexistent user", async () => {
    const res = await request(app)
      .post("/api/auth")
      .send({ email: "nobody@example.com", password: validUser.password });
    expect(res.status).toBe(401);
  });

  it("returns 401 for a wrong password", async () => {
    const res = await request(app)
      .post("/api/auth")
      .send({ email: validUser.email, password: "WrongPass@1!" });
    expect(res.status).toBe(401);
  });

  it("returns 200 and sets an httpOnly cookie on success", async () => {
    const res = await request(app)
      .post("/api/auth")
      .send({ email: validUser.email, password: validUser.password });
    expect(res.status).toBe(200);
    expect(res.headers["set-cookie"]).toBeDefined();
    expect(res.body.email).toBe(validUser.email);
  });
});

describe("POST /api/auth/logout", () => {
  it("returns 200 and clears the cookie", async () => {
    const res = await request(app).post("/api/auth/logout");
    expect(res.status).toBe(200);
  });
});
