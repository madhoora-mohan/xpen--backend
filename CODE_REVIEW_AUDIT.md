# Code Review Audit — xpen-backend

**Date:** 2026-05-18  
**Scope:** Full codebase review — security, correctness, code quality, architecture  
**Branch audited:** `master`

---

## Summary

This is a Node.js/Express REST API for personal expense tracking backed by MongoDB. The codebase is small (10 files, ~500 LOC) but contains a significant number of defects spanning critical security vulnerabilities, logic bugs that silently pass invalid data, structural problems that cause routes to register twice, and several configuration errors that will break the application in Docker or in production.

Issues are grouped by severity.

---

## CRITICAL — Security Vulnerabilities

### 1. No authentication on any transaction route

**File:** `routes/transactions.js`

All eight transaction endpoints (`add-income`, `get-incomes`, `delete-income`, `add-expense`, `get-expenses`, `delete-expense`, `get-limit`, `update-limit`) have zero authentication. Any unauthenticated caller can read or destroy any user's data by supplying an email address.

**Why it's bad:** The app generates JWT tokens on login but never verifies them for protected routes. This makes authentication entirely decorative — the tokens are issued but never enforced.

**How to fix:** Add a JWT verification middleware and apply it to all transaction routes:

```js
// middleware/auth.js
const jwt = require("jsonwebtoken");

module.exports = (req, res, next) => {
  const token = req.header("x-auth-token");
  if (!token) return res.status(401).json({ message: "Access denied. No token provided." });

  try {
    req.user = jwt.verify(token, process.env.JWTPRIVATEKEY);
    next();
  } catch (err) {
    res.status(400).json({ message: "Invalid token." });
  }
};
```

```js
// routes/transactions.js
const auth = require("../middleware/auth");

router
  .post("/add-income", auth, addIncome)
  .get("/get-incomes", auth, getIncomes)
  // ...
```

---

### 2. Users can access any other user's data

**Files:** `routes/transactions.js`, `controllers/income.js`, `controllers/expense.js`

Routes accept an `:email` parameter and return data for that email with no check that the requester owns that email. User A can pass User B's email and read or delete User B's transactions.

**Why it's bad:** This is an Insecure Direct Object Reference (IDOR), one of the OWASP Top 10. Combined with issue #1, it requires zero authentication to exploit.

**How to fix:** After adding authentication middleware (issue #1), derive the email from the verified JWT payload instead of accepting it as a URL parameter:

```js
exports.getIncomes = async (req, res) => {
  const email = req.user.email; // from verified JWT, not from URL
  const incomes = await IncomeSchema.find({ email }).sort({ date: 1 });
  res.status(200).json(incomes);
};
```

---

### 3. `getLimit` returns full user documents including hashed passwords

**File:** `controllers/limit.js:7`

```js
// current — returns entire user object
const income = await User.find({ email: email });
```

The response includes the bcrypt-hashed password, email, username, and all other stored fields.

**Why it's bad:** Exposing hashed passwords is a security risk. If `bcrypt` work factors are low or a pre-image attack is feasible, this leaks the password hash to any caller.

**How to fix:** Use a projection to return only the `limit` field:

```js
const user = await User.findOne({ email }, { limit: 1, _id: 0 });
```

---

### 4. CORS is fully open

**File:** `app.js:15`

```js
app.use(cors()); // no origin restriction
```

**Why it's bad:** Any domain on the internet can make credentialed cross-origin requests to this API in production.

**How to fix:**

```js
app.use(cors({
  origin: process.env.ALLOWED_ORIGIN || "http://localhost:3000",
  methods: ["GET", "POST", "PUT", "DELETE"],
}));
```

---

### 5. No rate limiting on authentication endpoints

**Files:** `routes/auth.jsx`, `routes/user.jsx`

There is no rate limiting on login or registration endpoints, making brute-force and credential-stuffing attacks trivial.

**How to fix:** Use `express-rate-limit`:

```js
const rateLimit = require("express-rate-limit");
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });
app.use("/api/auth", authLimiter, authRoutes);
```

---

### 6. `upsert: true` in `updateLimit` can create phantom User documents

**File:** `controllers/limit.js:23`

```js
await User.updateOne({ email }, { $set: { limit: uplimit } }, { upsert: true });
```

If `email` doesn't match an existing user, MongoDB will create a new User document with only the `limit` field set, bypassing all schema validations and the registration flow.

**Why it's bad:** An attacker can inject arbitrary email addresses into the User collection with crafted limit values.

**How to fix:** Remove `upsert: true`. Verify the user exists first:

```js
const result = await User.updateOne({ email }, { $set: { limit: uplimit } });
if (result.matchedCount === 0)
  return res.status(404).json({ message: "User not found" });
```

---

### 7. No NoSQL injection protection

**Files:** Multiple controllers

URL params like `:email` and body fields are passed directly to Mongoose queries without sanitisation. A value like `{ "$gt": "" }` submitted as a JSON body field would bypass equality checks.

**How to fix:** Add `express-mongo-sanitize`:

```js
const mongoSanitize = require("express-mongo-sanitize");
app.use(mongoSanitize());
```

---

## HIGH — Logic Bugs (Silent Data Corruption)

### 8. `!amount === "number"` is always `false` — type check is broken

**Files:** `controllers/expense.js:19`, `controllers/income.js:20`

```js
if (amount <= 0 || !amount === "number") {
```

**Why it's bad:** Due to operator precedence, `!amount` evaluates first, producing a boolean (`true` or `false`). A boolean compared to the string `"number"` is always `false`. The type check never triggers. A client can submit `amount: "hello"` and it will be saved to the database without error.

**How to fix:**

```js
if (typeof amount !== "number" || amount <= 0) {
  return res.status(400).json({ message: "Amount must be a positive number!" });
}
```

---

### 9. Model instance created before validation runs

**Files:** `controllers/expense.js:5-23`, `controllers/income.js:6-24`

```js
const income = ExpenseSchema({ email, title, amount, ... }); // created here

try {
  if (!title || !category || !date) { // validated here — too late
    return res.status(400).json(...);
  }
  // ...
  await income.save();
}
```

**Why it's bad:** The document object is constructed before any validation. If validation returns early (line 16), the object was already built but not saved — this is harmless for the save, but `email` is never validated so it can be `undefined`, which Mongoose will reject at `.save()` with an unhandled schema validation error that bubbles to the generic 500 handler, giving the client no useful feedback.

**How to fix:** Validate inputs first, then construct the model:

```js
exports.addExpense = async (req, res) => {
  const { email, title, amount, category, description, date } = req.body;

  if (!email || !title || !category || !date)
    return res.status(400).json({ message: "All fields are required!" });
  if (typeof amount !== "number" || amount <= 0)
    return res.status(400).json({ message: "Amount must be a positive number!" });

  try {
    await new ExpenseSchema({ email, title, amount, category, description, date }).save();
    res.status(200).json({ message: "Expense Added" });
  } catch (error) {
    res.status(500).json({ message: "Server Error" });
  }
};
```

---

### 10. `email` is not validated in income/expense controllers

**Files:** `controllers/expense.js:16`, `controllers/income.js:17`

```js
if (!title || !category || !date) { // email is missing from this check
```

`email` is a required field in both schemas. If it is absent, the schema-level validation at `.save()` throws, producing an opaque 500 response rather than a meaningful 400.

**How to fix:** Add `!email` to the validation condition (shown in fix for issue #9 above).

---

### 11. Email in URL param is ignored; body email is used instead

**File:** `routes/transactions.js:14-15`, `controllers/income.js:3-4`

Routes are defined as `POST /add-income/:email` but controllers destructure email from `req.body`. The `:email` URL parameter is silently discarded. The route contract advertised to clients is wrong.

**How to fix:** Either remove the `:email` from the route and always use the JWT (preferred, see issue #2), or be consistent and use `req.params.email` in the controller if keeping URL params.

---

### 12. `limit` validated as `Joi.string()` but stored as `Number`

**File:** `models/User.jsx:43`

```js
limit: Joi.string().required().label("Limit"),
```

The Mongoose schema defines `limit` as `{ type: Number, required: true }`, but the Joi validation accepts any string for this field. A user can register with `limit: "abc"` and pass Joi validation. Mongoose will then either coerce or reject it, producing an inconsistent experience.

**How to fix:**

```js
limit: Joi.number().min(0).required().label("Limit"),
```

---

### 13. `deleteExpense` leaks the deleted document in the response

**File:** `controllers/expense.js:49`

```js
res.status(200).json({ message: "Expense Deleted", income });
```

The full deleted document (named `income` despite being an expense) is returned in the response. This is an information leak and the variable name is wrong.

**How to fix:**

```js
res.status(200).json({ message: "Expense Deleted" });
```

---

## HIGH — Structural / Route Registration Bug

### 14. Auth and user routes are registered twice

**File:** `app.js:18-22`

```js
app.use("/api/users", userRoutes);  // registered at /api/users
app.use("/api/auth", authRoutes);   // registered at /api/auth

readdirSync("./routes").map((route) =>
  app.use("/api/v1", require("./routes/" + route))  // ALL routes including auth.jsx and user.jsx registered again at /api/v1
);
```

`readdirSync` loads every file in `/routes`, which includes `auth.jsx` and `user.jsx`. These are mounted a second time under `/api/v1`, creating endpoints like `POST /api/v1/` that shadow or duplicate the intentional routes.

**Why it's bad:** Unintended routes are exposed. The dynamic loader was likely intended for only `transactions.js` but applies to everything.

**How to fix:** Either drop the dynamic loader and import explicitly, or exclude already-registered routes:

```js
// Option A: explicit imports (clearer)
app.use("/api/users", userRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/v1", transactionRoutes);

// Option B: filter the dynamic loader
readdirSync("./routes")
  .filter(f => f === "transactions.js")
  .forEach(route => app.use("/api/v1", require("./routes/" + route)));
```

---

## MEDIUM — Code Quality

### 15. Wrong file extensions on backend files

**Files:** `models/User.jsx`, `routes/auth.jsx`, `routes/user.jsx`

`.jsx` is a React JSX extension. These files contain plain Node.js CommonJS modules with no JSX. Using `.jsx` confuses editors, linters, bundlers, and any developer who opens the project.

**How to fix:** Rename all three to `.js`.

---

### 16. Variable named `income` in expense controller

**File:** `controllers/expense.js:5, 36, 48`

```js
const income = ExpenseSchema({ ... });       // line 5 — should be `expense`
const incomes = await ExpenseSchema.find();  // line 36 — should be `expenses`
.then((income) => {                          // line 48 — should be `expense`
```

**Why it's bad:** Misleading names cause maintainers to misread the data flow. This is a copy-paste artefact from the income controller.

---

### 17. Mixed async styles in delete controllers

**Files:** `controllers/expense.js:46-54`, `controllers/income.js:46-55`

`deleteExpense` and `deleteIncome` use `.then().catch()` while every other method in the same files uses `async/await`. The functions are also not declared `async`, which means unhandled rejections outside the `.catch()` propagate differently than in `async` functions.

**How to fix:** Standardise on `async/await`:

```js
exports.deleteExpense = async (req, res) => {
  try {
    await ExpenseSchema.findByIdAndDelete(req.params.id);
    res.status(200).json({ message: "Expense Deleted" });
  } catch (err) {
    res.status(500).json({ message: "Server Error" });
  }
};
```

---

### 18. `console.log` left in production code

**Files:** `db/db.js:9`, `routes/user.jsx:21`, `controllers/limit.js:10, 27`

Production code should not log raw errors or stack traces to stdout. Use a structured logger (e.g., `pino`) or at minimum remove these statements.

---

### 19. `validate` imported but unused

**File:** `controllers/limit.js:1`

```js
const { User, validate } = require("../models/User.jsx");
```

`validate` is never called in `limit.js`. This is dead code.

---

### 20. Commented-out dead code

**Files:** `models/User.jsx:7-10`, `routes/auth.jsx:23-24, 32-33`

Leftover commented-out blocks clutter the code. If changes are reversible they belong in git history, not in source files.

---

### 21. `maxLength` and `trim` on non-string fields are no-ops

**Files:** `models/ExpenseModel.js:18-20`, `models/IncomeModel.js:18-20`, and date fields

```js
amount: {
  type: Number,
  maxLength: 20,  // no-op on Number
  trim: true,     // no-op on Number
},
date: {
  type: Date,
  trim: true,     // no-op on Date
},
```

Mongoose silently ignores `maxLength` and `trim` on non-string types. These give a false impression that constraints are being enforced.

**How to fix:** Remove them. Add a `max` validator for `amount` if needed:

```js
amount: { type: Number, required: true, min: [0.01, "Amount must be positive"] }
```

---

### 22. `description` maxLength of 20 characters is unrealistically short

**Files:** `models/ExpenseModel.js:38`, `models/IncomeModel.js:38`

A 20-character description would truncate almost any real-world text. "Grocery shopping Sat" is already 20 characters.

**How to fix:** Raise to a reasonable limit such as 200–500 characters.

---

### 23. No unique constraint on `email` in User schema

**File:** `models/User.jsx:17-19`

The route checks for duplicate emails in application code, but there is no `unique: true` index at the database level. Under concurrent requests (race condition), two users could register with the same email simultaneously and both pass the application-level check before either is saved.

**How to fix:**

```js
email: { type: String, required: true, unique: true }
```

---

### 24. `limit` field required at registration with no meaningful default

**File:** `models/User.jsx:20-22`

Users must supply a spending limit at registration, which is unusual UX. If the field is optional or has a sensible default, model it accordingly.

**How to fix (if optional):**

```js
limit: { type: Number, default: 0 }
```

---

## LOW — Configuration & Dependencies

### 25. Dockerfile ENV values are literal strings, not runtime variables

**File:** `Dockerfile:2-4`

```dockerfile
ENV MONGODB_URL process.env.MONGO_URL
ENV JWTPRIVATEKEY process.env.JWTPRIVATEKEY
ENV SALT process.env.SALT
```

This literally sets the environment variable `MONGODB_URL` to the string `"process.env.MONGO_URL"` inside the image. The app will receive the string `"process.env.MONGO_URL"` rather than the actual connection string.

**Why it's bad:** The application will fail to connect to MongoDB when run from this image.

**How to fix:** Remove the `ENV` directives from the Dockerfile entirely. Pass secrets at runtime:

```bash
docker run -e MONGO_URL=... -e JWTPRIVATEKEY=... -e SALT=... -e PORT=8080 xpen-backend
```

---

### 26. Dockerfile uses `MONGODB_URL` but app reads `MONGO_URL`

**File:** `Dockerfile:2`, `db/db.js:6`

The Dockerfile sets `MONGODB_URL`; the application reads `process.env.MONGO_URL`. Even if the Dockerfile ENV syntax were fixed, the variable name mismatch means the connection string would never reach the app.

---

### 27. `start` script uses `nodemon` (a dev tool) — no production start script

**File:** `package.json:7`

```json
"scripts": {
  "start": "nodemon app.js"
}
```

`nodemon` watches files for changes and auto-restarts the process. This is a development convenience, not appropriate for production. The Dockerfile `CMD ["npm", "start"]` therefore runs a dev watcher in production.

**How to fix:**

```json
"scripts": {
  "start": "node app.js",
  "dev": "nodemon app.js"
}
```

---

### 28. `nodemon` and `nodeman` are both listed as dependencies

**File:** `package.json:21-22`

```json
"nodeman": "^1.1.2",
"nodemon": "^2.0.20",
```

`nodeman` appears to be a typo for `nodemon`. Two entries exist when one was intended.

**How to fix:** Remove `nodeman`. Move `nodemon` to `devDependencies`.

---

### 29. `axios` and `react-router-dom` are unused backend dependencies

**File:** `package.json:12, 23`

Neither `axios` nor `react-router-dom` is imported anywhere in the backend codebase. `react-router-dom` is a frontend-only library that has no valid use in a Node.js backend.

**How to fix:** Remove both from `dependencies`.

---

### 30. No fallback value for `PORT`

**File:** `app.js:11`

```js
const PORT = process.env.PORT;
```

If `PORT` is not set in the environment, `app.listen(undefined, ...)` will pick a random OS-assigned port with no indication of what port the server is actually on (beyond the console log).

**How to fix:**

```js
const PORT = process.env.PORT || 3000;
```

---

### 31. DB connection failure does not stop the server

**File:** `db/db.js:8-11`

```js
} catch (error) {
  console.log(error);
  console.log("DB Connection Error");
}
```

If MongoDB is unreachable, the error is logged but the Express server continues listening and serving requests. All requests that touch the database will fail with 500 errors.

**How to fix:** Exit the process on connection failure:

```js
} catch (error) {
  console.error("DB Connection Error:", error.message);
  process.exit(1);
}
```

---

### 32. JWT payload uses `email` not `_id`

**File:** `models/User.jsx:31`

```js
jwt.sign({ email: this.email }, ...)
```

Embedding email in the JWT means that if a user changes their email, all existing tokens remain valid for the old email. Using the immutable `_id` is standard practice.

**How to fix:**

```js
jwt.sign({ _id: this._id }, process.env.JWTPRIVATEKEY, { expiresIn: "2d" });
```

---

### 33. No tests

The repository has no test suite — no unit tests, no integration tests, no test runner configuration. Core business logic (validation, authentication) is entirely untested.

**Minimum recommended coverage:**
- Registration: duplicate email, weak password, missing fields
- Login: wrong password, nonexistent user, successful login token shape
- Transactions: unauthenticated access returns 401, invalid amount rejected, data scoped to authenticated user

---

## Issue Count by Severity

| Severity | Count |
|----------|-------|
| Critical (security) | 7 |
| High (logic bugs / structural) | 7 |
| Medium (code quality) | 10 |
| Low (config / deps) | 9 |
| **Total** | **33** |

---

## Recommended Fix Priority

1. Add JWT authentication middleware and apply to all transaction routes (#1, #2)
2. Fix the broken type check on `amount` (#8)
3. Fix `getLimit` leaking password hashes (#3)
4. Fix `upsert: true` creating phantom users (#6)
5. Fix double route registration (#14)
6. Fix Dockerfile ENV syntax and variable name mismatch (#25, #26)
7. Fix `start` script to use `node` not `nodemon` (#27)
8. Add NoSQL injection sanitisation (#7)
9. Add rate limiting (#5)
10. Fix `limit` Joi type mismatch (#12)
11. Rename `.jsx` files to `.js` (#15)
12. Fix variable naming in expense controller (#16)
13. Remove unused dependencies (#28, #29)
14. All remaining medium/low issues
