require("dotenv").config();
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const rateLimit = require("express-rate-limit");
const mongoSanitize = require("express-mongo-sanitize");
const { db } = require("./db/db");
const userRoutes = require("./routes/user");
const authRoutes = require("./routes/auth");
const transactionRoutes = require("./routes/transactions");

const app = express();

const PORT = process.env.PORT || 3001;

const ALLOWED_ORIGINS = [
  "http://localhost:3000",
  "https://xpenz.vercel.app",
];

const ALLOWED_ORIGIN_PATTERNS = [
  /^https:\/\/xpen-frontend-.*\.vercel\.app$/,
];

//middlewares
app.use(express.json());
app.use(cookieParser());
app.use(mongoSanitize());
app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
      if (ALLOWED_ORIGIN_PATTERNS.some((p) => p.test(origin))) return cb(null, true);
      cb(null, false);
    },
    credentials: true,
  })
);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 35,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests, please try again later." },
});

//routes
app.use("/api/users", authLimiter, userRoutes);
app.use("/api/auth", authLimiter, authRoutes);
app.use("/api/v1", transactionRoutes);

const server = () => {
  db();
  app.listen(PORT, () => {
    console.log("listening to port:", PORT);
  });
};

if (require.main === module) {
  server();
}

module.exports = app;
