const jwt = require("jsonwebtoken");

module.exports = (req, res, next) => {
  const token = req.cookies?.token;
  if (!token) {
    return res
      .status(401)
      .send({ code: "NO_TOKEN", message: "Authentication required" });
  }
  try {
    const { _id, email } = jwt.verify(token, process.env.JWTPRIVATEKEY);
    if (!email) {
      return res.status(401).send({ code: "INVALID_TOKEN", message: "Session expired" });
    }
    req.user = { _id, email };
    next();
  } catch (err) {
    const code =
      err.name === "TokenExpiredError" ? "TOKEN_EXPIRED" : "INVALID_TOKEN";
    return res.status(401).send({ code, message: "Session expired" });
  }
};
