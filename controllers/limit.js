const { User, validate } = require("../models/User.jsx");

exports.getLimit = async (req, res) => {
  const { email } = req.params;
  console.log(`[LIMIT] Get limit request - email: ${email}`);
  try {
    const user = await User.find({ email });
    console.log(`[LIMIT] Fetched limit for email: ${email}`);
    res.status(200).json(user);
  } catch (error) {
    console.error(`[LIMIT] Error fetching limit - email: ${email}`, error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

exports.updateLimit = async (req, res) => {
  const { email, uplimit } = req.params;
  console.log(`[LIMIT] Update limit request - email: ${email}, new limit: ${uplimit}`);
  try {
    const result = await User.updateOne(
      { email },
      { $set: { limit: uplimit } },
      { upsert: true }
    );
    console.log(`[LIMIT] Limit updated successfully - email: ${email}, new limit: ${uplimit}`);
    res.status(200).json(result);
  } catch (error) {
    console.error(`[LIMIT] Error updating limit - email: ${email}`, error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};
