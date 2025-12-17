// server.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
const mongoose = require("mongoose");
const connectDB = require("./config/db");
const { verifyToken } = require("./controllers/authController");

const app = express();
connectDB();

const CORS_ORIGIN = process.env.CORS_ORIGIN || "http://localhost:5173"; // default Vite dev origin
app.use(
	cors({
		origin: (origin, cb) => {
			// allow requests with no origin (e.g. curl, same-origin)
			if (!origin) return cb(null, true);
			// support comma-separated list
			const allowed = String(CORS_ORIGIN)
				.split(",")
				.map((s) => s.trim())
				.filter(Boolean);
			if (allowed.indexOf("*") !== -1 || allowed.indexOf(origin) !== -1) return cb(null, true);
			return cb(new Error("CORS origin not allowed"));
		}
	})
);
app.use(express.json());

app.use("/api/messages", require("./routes/messageRoutes"));
app.use("/api/auth", require("./routes/authRoutes"));

const server = http.createServer(app);

// prepare socket CORS origins (support comma-separated list)
const socketCorsOrigins = String(CORS_ORIGIN)
	.split(",")
	.map((s) => s.trim())
	.filter(Boolean);

const io = new Server(server, {
	cors: {
		origin: socketCorsOrigins.length === 1 ? socketCorsOrigins[0] : socketCorsOrigins,
		methods: ["GET", "POST"],
		credentials: true
	}
});

// socket auth: validate JWT in handshake auth.token
io.use((socket, next) => {
	try {
		const token = socket.handshake.auth && socket.handshake.auth.token;
		if (!token) return next();
		const payload = verifyToken(token);
		if (payload && payload.id) {
			socket.userId = payload.id;
		}
		return next();
	} catch (err) {
		return next();
	}
});

// Redis adapter for Socket.IO (enable horizontal scaling)
const { createAdapter } = require("@socket.io/redis-adapter");
const { createClient } = require("redis");
;(async () => {
	try {
		const pubClient = createClient({ url: process.env.REDIS_URL || "redis://127.0.0.1:6379" });
		const subClient = pubClient.duplicate();
		await pubClient.connect();
		await subClient.connect();
		io.adapter(createAdapter(pubClient, subClient));

		// pass a Redis client to socket handler for presence
		require("./socket/chatSocket")(io, pubClient);
	} catch (err) {
		console.warn("Redis not available — running without Redis adapter:", err && err.message ? err.message : err);
		// still initialize socket handlers without Redis client (presence will be local only)
		try {
			require("./socket/chatSocket")(io, null);
		} catch (e) {
			console.error("Failed to initialize chatSocket:", e);
		}
	}
})();

const PORT = process.env.PORT || 5000;
const httpServer = server.listen(PORT, () => console.log(`Server running on port ${PORT}`));

const gracefulShutdown = async () => {
	console.log("Shutting down server...");
	try {
		await new Promise((resolve, reject) => {
			httpServer.close((err) => (err ? reject(err) : resolve()));
		});
		console.log("HTTP server closed");
	} catch (err) {
		console.error("Error closing HTTP server:", err);
	}

	try {
		await mongoose.disconnect();
		console.log("MongoDB disconnected");
	} catch (err) {
		console.error("Error disconnecting MongoDB:", err);
	}

	process.exit(0);
};

process.on("SIGINT", gracefulShutdown);
process.on("SIGTERM", gracefulShutdown);
