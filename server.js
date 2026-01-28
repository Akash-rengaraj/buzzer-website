const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // Allow all origins for simplicity in this use case, or configure as needed
    methods: ["GET", "POST"],
  },
});

// Serve static files from the React client build directory
app.use(express.static(path.join(__dirname, "client/dist")));

// Socket.io Logic
io.on("connection", (socket) => {
  console.log("A user connected:", socket.id);

  socket.on("join_room", (room) => {
    socket.join(room);
    console.log(`User ${socket.id} joined room: ${room}`);
  });

  socket.on("buzz", (data) => {
    // data should contain room and user info (e.g., name)
    // Broadcast to everyone in the room (including sender, though usually host listens)
    // or just 'to' the room.
    const { room, playerName } = data;
    console.log(`Buzzer in room ${room} from ${playerName}`);
    io.to(room).emit("buzzed", {
      playerName,
      id: socket.id,
      timestamp: Date.now(),
    });
  });

  socket.on("reset", (room) => {
    console.log(`Resetting room: ${room}`);
    io.to(room).emit("reset_buzzer");
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
  });
});

// Catch-all handler to serve the React app for any unknown routes
app.get(/.*/, (req, res) => {
  res.sendFile(path.join(__dirname, "client/dist", "index.html"));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
