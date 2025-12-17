const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  phoneNumber: { type: String, unique: true },
  name: String,
  profilePic: String,
  lastSeen: Date
});

module.exports = mongoose.model("User", userSchema);
