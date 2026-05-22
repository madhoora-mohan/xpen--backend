const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const Joi = require("joi");
const passwordComplexity = require("joi-password-complexity");

const UserSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    maxlength: 30,
  },
  email: {
    type: String,
    required: true,
  },
  limit: {
    type: Number,
    required: true,
  },
  password: {
    type: String,
    required: true,
  },
});

UserSchema.methods.generateAuthToken = function () {
  let token = jwt.sign({ email: this.email }, process.env.JWTPRIVATEKEY, {
    expiresIn: "2d",
  });
  return token;
};

const User = mongoose.model("user", UserSchema);

const validate = (data) => {
  const schema = Joi.object({
    username: Joi.string().required().label("Username"),
    email: Joi.string().required().label("Email"),
    limit: Joi.number().min(0).required().label("Limit"),
    password: passwordComplexity().required().label("Password"),
  });
  return schema.validate(data);
};

module.exports = { User, validate };
