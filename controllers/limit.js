const { User, validate } = require("../models/User.jsx");

exports.getLimit = async (req, res) => {
  try {
    const { email } = req.params;
    const income = await User.find({ email: email });
    res.status(200).json(income);
  } catch (error) {
    res.status(500).json({ message: "Error vro" });
    console.log({ error });
  }
};

exports.updateLimit = async (req, res) => {
  const { email, uplimit } = req.params;
  // console.log(req);
  console.log(req.params);
  try {
    const income = await User.updateOne(
      { email },
      { $set: { limit: uplimit } },
      { upsert: true }
    );
    res.status(200).json(income);
  } catch (error) {
    res.status(500).json({ message: "Idhu semma error machi" });
    console.log(error);
  }
};
