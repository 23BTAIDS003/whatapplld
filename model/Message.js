const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema({
  // allow either an ObjectId (for DB chats) or a string id (for global/chat rooms)
  chatId: { type: mongoose.Schema.Types.Mixed, required: true },
  sender: { type: mongoose.Schema.Types.Mixed, ref: "User" },
  content: String,
  replyTo: { type: mongoose.Schema.Types.Mixed, default: null },
  type: { type: String, default: "text" },
  status: { type: String, default: "sent" }
}, { timestamps: true });

module.exports = mongoose.model("Message", messageSchema);
