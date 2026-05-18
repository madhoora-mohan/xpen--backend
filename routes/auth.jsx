const router = require("express").Router();
const { User } = require("../models/User.jsx");
const bcrypt = require("bcrypt");
const Joi = require("joi");

router.post("/", async (req, res) => {
  const { email } = req.body;
  console.log(`[AUTH] Login attempt - email: ${email}`);
  try {
    const { error } = validate(req.body);
    if (error) {
      console.log(`[AUTH] Validation failed - email: ${email}, reason: ${error.details[0].message}`);
      return res.status(400).send({ message: error.details[0].message });
    }

    const user = await User.findOne({ email });
    if (!user) {
      console.log(`[AUTH] Login failed - email not found: ${email}`);
      return res.status(401).send({ message: "Invalid Email or Password" });
    }

    const validPassword = await bcrypt.compare(
      req.body.password,
      user.password
    );
    if (!validPassword) {
      console.log(`[AUTH] Login failed - wrong password for email: ${email}`);
      return res.status(401).send({ message: "Invalid Email or Password" });
    }
    const token = user.generateAuthToken();
    console.log(`[AUTH] Login successful - email: ${email}`);
    res.status(200).send({
      email: user.email,
      username: user.username,
      data: token,
      message: "logged in successfully",
    });
  } catch (error) {
    console.error(`[AUTH] Internal error - email: ${email}`, error);
    res.status(500).send({ message: "Internal Server Error" });
  }
});

const validate = (data) => {
  const schema = Joi.object({
    email: Joi.string().email().required().label("Email"),
    password: Joi.string().required().label("Password"),
  });
  return schema.validate(data);
};

module.exports = router;
