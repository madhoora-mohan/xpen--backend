const { User, validate } = require("../models/User.jsx");
const router = require("express").Router();
const bcrypt = require("bcrypt");

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: "none",
  maxAge: 2 * 24 * 60 * 60 * 1000,
};

router.post("/", async (req, res) => {
  const { email } = req.body;
  console.log(`[USER] Registration attempt - email: ${email}`);
  try {
    const { error } = validate(req.body);
    if (error) {
      console.log(`[USER] Validation failed - email: ${email}, reason: ${error.details[0].message}`);
      return res.status(400).send({ message: error.details[0].message });
    }

    const user = await User.findOne({ email });
    if (user) {
      console.log(`[USER] Registration failed - email already in use: ${email}`);
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
    console.error(`[USER] Internal error - email: ${email}`, error);
    res.status(500).send({ message: "Server error" });
  }
});

module.exports = router;
