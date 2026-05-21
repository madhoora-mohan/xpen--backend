const jwt = require("jsonwebtoken");

module.exports = (req, res, next) => {
  const token = req.cookies?.token;
  if (!token) {
    return res
      .status(401)
      .send({ code: "NO_TOKEN", message: "Authentication required" });
  }
  try {
    req.user = jwt.verify(token, process.env.JWTPRIVATEKEY);
    next();
  } catch (err) {
    const code =
      err.name === "TokenExpiredError" ? "TOKEN_EXPIRED" : "INVALID_TOKEN";
    return res.status(401).send({ code, message: "Session expired" });
  }
};
