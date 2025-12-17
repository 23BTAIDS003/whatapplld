import React, { useEffect, useState, useRef } from "react";
import { io } from "socket.io-client";

const SOCKET_SERVER = import.meta.env.VITE_SOCKET_URL || "http://localhost:5000";
const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000";

export default function App() {
  const [connected, setConnected] = useState(false);
  const [messages, setMessages] = useState([]);
  const [queuedMessages, setQueuedMessages] = useState([]);
  const [replyingTo, setReplyingTo] = useState(null);
  const [input, setInput] = useState("");
  const [authMode, setAuthMode] = useState("login");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [user, setUser] = useState(null);
  const [onlineUsersCount, setOnlineUsersCount] = useState(0);
  const socketRef = useRef(null);

  useEffect(() => {
    const saved = localStorage.getItem("chat_auth");
    // load persisted messages and queued messages for offline support
    try {
      const savedMsgs = localStorage.getItem("chat_messages");
      if (savedMsgs) setMessages(JSON.parse(savedMsgs));
    } catch (e) {
      console.warn("Failed to parse saved messages:", e);
    }
    try {
      const savedQueue = localStorage.getItem("chat_queue");
      if (savedQueue) setQueuedMessages(JSON.parse(savedQueue));
    } catch (e) {
      console.warn("Failed to parse queued messages:", e);
    }
    if (saved) {
      const obj = JSON.parse(saved);
      setUser(obj.user);
      connectSocket(obj.token, obj.user);
    }

    return () => {
      if (socketRef.current) socketRef.current.disconnect();
    };
  }, []);

  // persist messages and queue to localStorage
  useEffect(() => {
    try {
      localStorage.setItem("chat_messages", JSON.stringify(messages));
    } catch (e) {
      console.warn("Failed to save messages:", e);
    }
  }, [messages]);

  useEffect(() => {
    try {
      localStorage.setItem("chat_queue", JSON.stringify(queuedMessages));
    } catch (e) {
      console.warn("Failed to save queued messages:", e);
    }
  }, [queuedMessages]);

  const connectSocket = (token, userObj) => {
    const socket = io(SOCKET_SERVER, { autoConnect: false, auth: { token } });
    socketRef.current = socket;

    socket.on("connect", () => setConnected(true));
    // when we reconnect, flush queued messages
    socket.on("connect", async () => {
      setConnected(true);
      if (queuedMessages && queuedMessages.length) {
        const q = [...queuedMessages];
        setQueuedMessages([]);
        for (const qm of q) {
          try {
            socket.emit("sendMessage", qm);
            // optimistically mark as sent in messages list
            setMessages((m) => m.map((mm) => (mm._localId && mm._localId === qm._localId ? { ...mm, status: "sent" } : mm)));
          } catch (err) {
            console.error("Failed to send queued message:", err);
            // re-queue if failed
            setQueuedMessages((prev) => [...prev, qm]);
          }
        }
      }
    });
    socket.on("disconnect", () => setConnected(false));

    socket.on("receiveMessage", (msg) => {
      setMessages((m) => {
        // if this message originated locally, replace the optimistic message with server version
        if (msg._localId) {
          let replaced = false;
          const mapped = m.map((mm) => {
            if (mm._localId && mm._localId === msg._localId) {
              replaced = true;
              return { ...msg };
            }
            return mm;
          });
          if (replaced) return mapped;
        }
        // otherwise avoid duplicate if same _id already exists
        if (msg._id && m.some((mm) => String(mm._id) === String(msg._id))) return m;
        return [...m, msg];
      });
    });

    socket.on("userOnline", () => setOnlineUsersCount((c) => c + 1));
    socket.on("userOffline", () => setOnlineUsersCount((c) => Math.max(0, c - 1)));

    socket.on("messageDelivered", ({ messageId }) => {
      setMessages((prev) =>
        prev.map((m) => (m._id && String(m._id) === String(messageId) ? { ...m, status: "delivered" } : m))
      );
    });

    socket.connect();
    if (userObj && userObj._id) {
      socket.emit("joinChat", { chatId: "global-chat", userId: userObj._id });
    }
  };

  const saveAuth = (token, user) => {
    localStorage.setItem("chat_auth", JSON.stringify({ token, user }));
    setUser(user);
  };

  const doRegister = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber: phone, name, password })
      });
      const body = await res.json();
      if (res.ok && body.token) {
        saveAuth(body.token, body.user);
        connectSocket(body.token, body.user);
      } else {
        alert(body.message || body.error || "Register failed");
      }
    } catch (err) {
      alert("Register error: " + err.message);
    }
  };

  const doLogin = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber: phone, password })
      });
      const body = await res.json();
      if (res.ok && body.token) {
        saveAuth(body.token, body.user);
        connectSocket(body.token, body.user);
      } else {
        alert(body.message || body.error || "Login failed");
      }
    } catch (err) {
      alert("Login error: " + err.message);
    }
  };

  const logout = () => {
    localStorage.removeItem("chat_auth");
    if (socketRef.current) socketRef.current.disconnect();
    setUser(null);
    setMessages([]);
  };

  const sendMessage = () => {
    if (!input.trim() || !user) return;
    const msg = {
      chatId: "global-chat",
      sender: user._id,
      content: input,
      replyTo: replyingTo ? (replyingTo._id || replyingTo._localId || replyingTo) : null,
      type: "text",
      // status will be 'sent' if socket connected, otherwise 'queued'
      status: connected ? "sent" : "queued",
      createdAt: new Date().toISOString()
    };

    // attach a local id so we can match queued messages after persistence
    msg._localId = `l_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;

    if (connected && socketRef.current && socketRef.current.connected) {
      socketRef.current.emit("sendMessage", msg);
      setMessages((m) => [...m, msg]);
    } else {
      // offline: queue the message and show it in UI
      setQueuedMessages((q) => [...q, msg]);
      setMessages((m) => [...m, msg]);
    }

    setInput("");
    setReplyingTo(null);
  };

  return (
    <div className="app">
      <header>
        <h1>Chat App (React)</h1>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div className={`status ${connected ? "online" : "offline"}`}>
            {connected ? "Socket: Connected" : "Socket: Disconnected"}
          </div>
          {queuedMessages && queuedMessages.length > 0 && (
            <div style={{ background: "#fffae6", padding: "4px 8px", borderRadius: 8, fontSize: 12 }}>
              Queued: {queuedMessages.length}
            </div>
          )}
        </div>
      </header>

      {!user ? (
        <div style={{ padding: 16 }}>
          <div style={{ marginBottom: 8 }}>
            <label style={{ display: "block" }}>Phone</label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>

          {authMode === "register" && (
            <div style={{ marginBottom: 8 }}>
              <label style={{ display: "block" }}>Name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
          )}

          <div style={{ marginBottom: 8 }}>
            <label style={{ display: "block" }}>Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>

          <div>
            {authMode === "login" ? (
              <>
                <button onClick={doLogin}>Login</button>
                <button onClick={() => setAuthMode("register")} style={{ marginLeft: 8 }}>
                  Switch to Register
                </button>
              </>
            ) : (
              <>
                <button onClick={doRegister}>Register</button>
                <button onClick={() => setAuthMode("login")} style={{ marginLeft: 8 }}>
                  Switch to Login
                </button>
              </>
            )}
          </div>
        </div>
      ) : (
        <main>
          <div style={{ padding: 12, borderBottom: "1px solid #eee", display: "flex", justifyContent: "space-between" }}>
            <div>Chat: global-chat</div>
            <div>
              <span style={{ marginRight: 12 }}>{user.name}</span>
              <span>Online users: {onlineUsersCount}</span>
              <button onClick={logout} style={{ marginLeft: 12 }}>
                Logout
              </button>
            </div>
          </div>

          <div className="messages">
            {messages.map((m, i) => {
              const senderId = m && m.sender ? (m.sender._id ? m.sender._id : m.sender) : null;
              const isYou = String(senderId) === String(user._id);
              const cls = isYou ? "message you" : "message other";
              return (
                <div className={cls} key={m._id || i} onClick={() => setReplyingTo(m)} style={{ cursor: "pointer" }}>
                  <div className="meta">
                    <strong>{isYou ? "You" : (m.sender && m.sender.name) ? m.sender.name : String(senderId)}</strong>
                    <span className="time">{new Date(m.createdAt).toLocaleTimeString()}</span>
                    <span style={{ marginLeft: 8, fontSize: 12, color: "#666" }}>{m.status || "sent"}</span>
                  </div>
                  {m.replyTo && (
                    <div style={{ fontSize: 12, color: "#666", borderLeft: "2px solid #eee", paddingLeft: 8, marginBottom: 6 }}>
                      <em>Replying to: </em>
                      {typeof m.replyTo === "string" ? m.replyTo : (m.replyTo && m.replyTo.content) ? m.replyTo.content : JSON.stringify(m.replyTo)}
                    </div>
                  )}
                  <div className="content">{m.content}</div>
                </div>
              );
            })}
          </div>

          <div className="composer">
            <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Type a message" onKeyDown={(e) => e.key === "Enter" && sendMessage()} />
            <button onClick={sendMessage}>Send</button>
            {queuedMessages && queuedMessages.length > 0 && (
              <div style={{ marginLeft: 12, display: "inline-flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 13, color: "#444" }}>Queued: {queuedMessages.length}</span>
                <button
                  onClick={() => {
                    if (!socketRef.current || !socketRef.current.connected) {
                      alert("Socket not connected — queued messages will be sent when connection is restored.");
                      return;
                    }
                    // flush queued messages now
                    const q = [...queuedMessages];
                    setQueuedMessages([]);
                    for (const qm of q) {
                      try {
                        socketRef.current.emit("sendMessage", qm);
                        setMessages((m) => m.map((mm) => (mm._localId && mm._localId === qm._localId ? { ...mm, status: "sent" } : mm)));
                      } catch (err) {
                        console.error("Failed to resend queued message:", err);
                        setQueuedMessages((prev) => [...prev, qm]);
                      }
                    }
                  }}
                >
                  Resend queued
                </button>
              </div>
            )}
          </div>
        </main>
      )}
    </div>
  );
}
