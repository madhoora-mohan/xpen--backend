const jwt = require("jsonwebtoken");
const { User } = require("../models/User");

module.exports = async (req, res, next) => {
  const token = req.cookies?.token;
  if (!token) {
    return res
      .status(401)
      .send({ code: "NO_TOKEN", message: "Authentication required" });
  }
  try {
    const { _id } = jwt.verify(token, process.env.JWTPRIVATEKEY);
    const user = await User.findById(_id, { email: 1 });
    if (!user) {
      return res
        .status(401)
        .send({ code: "INVALID_TOKEN", message: "Session expired" });
    }
    req.user = user;
    next();
  } catch (err) {
    const code =
      err.name === "TokenExpiredError" ? "TOKEN_EXPIRED" : "INVALID_TOKEN";
    return res.status(401).send({ code, message: "Session expired" });
  }
};
