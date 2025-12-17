const Chat = require("../model/Chat");

/**
 * Create one-to-one chat
 */
exports.createChat = async (req, res) => {
  try {
    const { participants } = req.body;

    if (!participants || participants.length !== 2) {
      return res.status(400).json({ message: "Two participants required" });
    }

    const existingChat = await Chat.findOne({
      isGroup: false,
      participants: { $all: participants, $size: 2 }
    });

    if (existingChat) {
      return res.json(existingChat);
    }

    const chat = await Chat.create({
      isGroup: false,
      participants
    });

    res.status(201).json(chat);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * Create group chat
 */
exports.createGroupChat = async (req, res) => {
  try {
    const { groupName, participants, admin } = req.body;

    if (!groupName || !participants || !admin) {
      return res.status(400).json({ message: "Missing fields" });
    }

    const chat = await Chat.create({
      isGroup: true,
      groupName,
      participants,
      admin
    });

    res.status(201).json(chat);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * Get all chats of a user
 */
exports.getUserChats = async (req, res) => {
  try {
    const chats = await Chat.find({
      participants: req.params.userId
    }).populate("participants", "name phoneNumber");

    res.json(chats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
