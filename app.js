require("dotenv").config();
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const { db } = require("./db/db");
const { readdirSync } = require("fs");
const userRoutes = require("./routes/user.jsx");
const authRoutes = require("./routes/auth.jsx");

const app = express();

const PORT = process.env.PORT;

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

//routes
app.use("/api/users", userRoutes);
app.use("/api/auth", authRoutes);
readdirSync("./routes").map((route) =>
  app.use("/api/v1", require("./routes/" + route))
);

const server = () => {
  db();
  app.listen(PORT, () => {
    console.log("listening to port:", PORT);
  });
};

server();
