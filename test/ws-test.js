const { io } = require("socket.io-client");

const token = "YOUR_JWT_TOKEN_HERE";

const socket = io("http://localhost:3001/driver", {
  auth: { token },
  transports: ["websocket"],
});

socket.on("connect", () => {
  console.log("✅ WebSocket authenticated, socket id:", socket.id);

  // 👇 ACK-style ping
  socket.emit("PING_V1", null, (pong) => {
    console.log("🏓 PONG ACK received:", pong);
  });
});

socket.on("connect_error", (err) => {
  console.error("❌ Connection error:", err.message);
});
