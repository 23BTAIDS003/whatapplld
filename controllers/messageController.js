const Message = require("../model/Message");

/**
 * Send message
 */
exports.sendMessage = async (req, res) => {
  try {
    const { chatId, sender, content, type } = req.body;

    if (!chatId || !sender || !content) {
      return res.status(400).json({ message: "Missing fields" });
    }

    const message = await Message.create({
      chatId,
      sender,
      content,
      type: type || "text",
      status: "sent"
    });

    res.status(201).json(message);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * Get messages of a chat
 */
exports.getMessagesByChat = async (req, res) => {
  try {
    const messages = await Message.find({
      chatId: req.params.chatId
    }).populate("sender", "name");

    res.json(messages);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * Mark message as read
 */
exports.markMessageAsRead = async (req, res) => {
  try {
    await Message.findByIdAndUpdate(req.params.messageId, {
      status: "read"
    });
    res.json({ message: "Message marked as read" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
