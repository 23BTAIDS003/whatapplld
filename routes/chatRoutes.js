const router = require("express").Router();
const Chat = require("../model/Chat");

router.post("/create", async (req, res) => {
  const chat = await Chat.create(req.body);
  res.json(chat);
});

module.exports = router;
