const { User } = require("../models/User");

exports.getLimit = async (req, res) => {
  const email = req.user.email;
  try {
    const user = await User.findOne({ email }, { limit: 1, _id: 0 });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    res.status(200).json(user);
  } catch (error) {
    console.error("getLimit failed:", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

exports.updateLimit = async (req, res) => {
  const email = req.user.email;
  const { uplimit } = req.body;

  if (typeof uplimit !== "number" || uplimit < 0) {
    return res
      .status(400)
      .json({ message: "Limit must be a non-negative number!" });
  }

  try {
    const result = await User.updateOne(
      { email },
      { $set: { limit: uplimit } }
    );
    if (result.matchedCount === 0) {
      return res.status(404).json({ message: "User not found" });
    }
    res.status(200).json({ message: "Limit updated" });
  } catch (error) {
    console.error("updateLimit failed:", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
};
