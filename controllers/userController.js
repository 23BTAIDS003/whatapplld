const User = require("../model/User");

/**
 * Register new user
 */
exports.registerUser = async (req, res) => {
  try {
    const { phoneNumber, name } = req.body;

    if (!phoneNumber || !name) {
      return res.status(400).json({ message: "Missing fields" });
    }

    const existingUser = await User.findOne({ phoneNumber });
    if (existingUser) {
      return res.status(400).json({ message: "User already exists" });
    }

    const user = await User.create({
      phoneNumber,
      name,
      lastSeen: new Date()
    });

    res.status(201).json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * Get user by ID
 */
exports.getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * Update last seen
 */
exports.updateLastSeen = async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.params.id, {
      lastSeen: new Date()
    });
    res.json({ message: "Last seen updated" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
