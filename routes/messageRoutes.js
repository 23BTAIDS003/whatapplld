const router = require("express").Router();
const { sendMessage } = require("../controllers/messageController");

router.post("/send", sendMessage);
module.exports = router;
