const { User, validate } = require("../models/User");
const router = require("express").Router();
const bcrypt = require("bcrypt");

const isProd = process.env.NODE_ENV === "production";
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: isProd,
  sameSite: isProd ? "none" : "lax",
  maxAge: 2 * 24 * 60 * 60 * 1000,
};

router.post("/", async (req, res) => {
  try {
    const { error } = validate(req.body);
    if (error) {
      return res.status(400).send({ message: error.details[0].message });
    }

    const existing = await User.findOne({ email: req.body.email });
    if (existing) {
      return res.status(409).send({ message: "Email already in use" });
    }

    const salt = await bcrypt.genSalt(Number(process.env.SALT_ROUNDS));
    const hashPassword = await bcrypt.hash(req.body.password, salt);

    const newUser = await new User({
      ...req.body,
      password: hashPassword,
    }).save();
    const token = newUser.generateAuthToken();
    res
      .cookie("token", token, COOKIE_OPTIONS)
      .status(201)
      .send({
        email: newUser.email,
        username: newUser.username,
        message: "User created successfully",
      });
  } catch (error) {
    console.error("registration failed:", error.message);
    res.status(500).send({ message: "Server error" });
  }
});

module.exports = router;
