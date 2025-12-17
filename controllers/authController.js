const User = require("../model/User");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "change_this_secret";

exports.register = async (req, res) => {
  try {
    const { phoneNumber, name, password } = req.body;
    if (!phoneNumber || !name || !password) return res.status(400).json({ message: "Missing fields" });

    const existing = await User.findOne({ phoneNumber });
    if (existing) return res.status(400).json({ message: "User already exists" });

    const hash = await bcrypt.hash(password, 10);
    const user = await User.create({ phoneNumber, name, password: hash, lastSeen: new Date() });

    const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: "7d" });
    res.status(201).json({ token, user: { _id: user._id, phoneNumber: user.phoneNumber, name: user.name } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.login = async (req, res) => {
  try {
    const { phoneNumber, password } = req.body;
    if (!phoneNumber || !password) return res.status(400).json({ message: "Missing fields" });

    const user = await User.findOne({ phoneNumber });
    if (!user) return res.status(400).json({ message: "Invalid credentials" });

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(400).json({ message: "Invalid credentials" });

    const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: "7d" });
    res.json({ token, user: { _id: user._id, phoneNumber: user.phoneNumber, name: user.name } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.verifyToken = (token) => {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return null;
  }
};
