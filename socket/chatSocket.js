// socket/chatSocket.js
const Message = require("../model/Message");
const Chat = require("../model/Chat");

module.exports = (io, redisClient) => {
  if (!redisClient) {
    console.warn("chatSocket: redisClient not provided — presence will be local only");
  }

  const addOnline = async (userId, socketId) => {
    if (redisClient) {
      await redisClient.sAdd(`online:${userId}`, socketId);
      await redisClient.set(`socket:${socketId}`, userId);
      return await redisClient.sCard(`online:${userId}`);
    }
    return 1;
  };

  const removeOnline = async (socketId) => {
    if (redisClient) {
      const userId = await redisClient.get(`socket:${socketId}`);
      if (!userId) return null;
      await redisClient.sRem(`online:${userId}`, socketId);
      await redisClient.del(`socket:${socketId}`);
      const remaining = await redisClient.sCard(`online:${userId}`);
      return { userId, remaining };
    }
    return null;
  };

  const isUserOnline = async (userId) => {
    if (redisClient) {
      const c = await redisClient.sCard(`online:${userId}`);
      return c > 0;
    }
    return false;
  };

  io.on("connection", (socket) => {
    console.log(`Socket connected: id=${socket.id} userId=${socket.userId || 'anonymous'}`);
    (async () => {
      try {
        if (socket.userId) {
          await addOnline(socket.userId, socket.id);
          socket.join(socket.userId);
          io.emit("userOnline", socket.userId);
        }
      } catch (err) {
        console.error("Error registering presence on connect:", err);
      }
    })();

    socket.on("error", (err) => {
      console.error(`Socket error (id=${socket.id}):`, err);
    });

    socket.on("userOnline", async (userId) => {
      if (!userId) return;
      try {
        await addOnline(userId, socket.id);
        socket.join(userId);
        io.emit("userOnline", userId);
      } catch (err) {
        console.error("userOnline error:", err);
      }
    });

    socket.on("joinChat", async (payload) => {
      const chatId = payload && payload.chatId ? payload.chatId : payload;
      const userId = payload && payload.userId ? payload.userId : undefined;
      socket.join(chatId);

      if (userId) {
        try {
          const undelivered = await Message.find({
            chatId,
            status: { $ne: "delivered" },
            sender: { $ne: userId }
          });

          for (const m of undelivered) {
            socket.emit("receiveMessage", m);
            m.status = "delivered";
            await m.save();
            io.to(String(m.sender)).emit("messageDelivered", { messageId: m._id, deliveredTo: userId });
          }
        } catch (err) {
          console.error("Error delivering queued messages:", err);
        }
      }
    });

    socket.on("sendMessage", async (data) => {
      console.log(`sendMessage from socket=${socket.id} user=${socket.userId} chat=${data && data.chatId}`);
      try {
        const msgDoc = await Message.create(data);
        // populate sender info so clients can show sender name (and distinguish 'You')
        let populated = await Message.findById(msgDoc._id).populate("sender", "_id name");
        let msg = populated && populated.toObject ? populated.toObject() : msgDoc;
        // preserve client's local id so client can deduplicate/merge optimistic messages
        if (data && data._localId) msg._localId = data._localId;
        console.log(`message saved ${msg._id} local=${msg._localId || "-"}`);
        io.to(data.chatId).emit("receiveMessage", msg);

        const chat = await Chat.findById(data.chatId).populate("participants", "_id");
        let delivered = false;
        if (chat && chat.participants && chat.participants.length) {
          for (const p of chat.participants) {
            const pid = String(p._id);
            if (pid === String(data.sender)) continue;
            const online = await isUserOnline(pid);
            if (online) {
              delivered = true;
              io.to(pid).emit("receiveMessage", msg);
              io.to(pid).emit("messageDelivered", { messageId: msg._id, deliveredTo: pid });
            }
          }
        }

        if (delivered) {
          // update saved message status
          try {
            await Message.findByIdAndUpdate(msg._id, { status: "delivered" });
          } catch (e) {
            console.error("Failed to update message delivered status:", e);
          }
          io.to(String(data.sender)).emit("messageDelivered", { messageId: msg._id, deliveredTo: "multiple" });
        }
      } catch (err) {
        console.error("Error in sendMessage:", err);
      }
    });

    socket.on("disconnect", async () => {
      console.log(`Socket disconnected: id=${socket.id} userId=${socket.userId || 'anonymous'}`);
      try {
        const res = await removeOnline(socket.id);
        if (res && res.userId && res.remaining === 0) {
          io.emit("userOffline", res.userId);
        }
      } catch (err) {
        console.error("Error on disconnect presence cleanup:", err);
      }
    });
  });
};
