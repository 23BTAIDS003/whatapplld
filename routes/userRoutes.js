const router = require("express").Router();
const User = require("../model/User");

router.post("/register", async (req, res) => {
  const user = await User.create(req.body);
  res.json(user);
});

module.exports = router;
