const router = require("express").Router();
const { User } = require("../models/User");
const bcrypt = require("bcrypt");
const Joi = require("joi");

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: "none",
  maxAge: 2 * 24 * 60 * 60 * 1000,
};

router.post("/", async (req, res) => {
  try {
    const { error } = validate(req.body);
    if (error) {
      return res.status(400).send({ message: error.details[0].message });
    }

    const user = await User.findOne({ email: req.body.email });
    if (!user) {
      return res.status(401).send({ message: "Invalid Email or Password" });
    }

    const validPassword = await bcrypt.compare(
      req.body.password,
      user.password
    );
    if (!validPassword) {
      return res.status(401).send({ message: "Invalid Email or Password" });
    }

    const token = user.generateAuthToken();
    res
      .cookie("token", token, COOKIE_OPTIONS)
      .status(200)
      .send({
        email: user.email,
        username: user.username,
        message: "logged in successfully",
      });
  } catch (error) {
    console.error("login failed:", error.message);
    res.status(500).send({ message: "Internal Server Error" });
  }
});

router.post("/logout", (req, res) => {
  res
    .clearCookie("token", {
      httpOnly: true,
      secure: true,
      sameSite: "none",
    })
    .status(200)
    .send({ message: "logged out" });
});

const validate = (data) => {
  const schema = Joi.object({
    email: Joi.string().email().required().label("Email"),
    password: Joi.string().required().label("Password"),
  });
  return schema.validate(data);
};

module.exports = router;
