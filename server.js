const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", 
    methods: ["GET", "POST"],
  },
});

// Serve static files from the React client build directory
app.use(express.static(path.join(__dirname, "client/dist")));

// --- State Management ---
// Rooms structure:
// {
//   [roomCode]: {
//     hostId: string | null, // Socket ID of the main host
//     players: { 
//       [socketId]: { name: string, joinedAt: number } 
//     },
//     buzzes: [ { playerName: string, socketId: string, timestamp: number } ],
//     isLocked: boolean
//   }
// }
const rooms = {};

// Helper to get room state for clients
const getRoomState = (roomCode) => {
  const room = rooms[roomCode];
  if (!room) return null;
  return {
    roomCode,
    isLocked: room.isLocked,
    buzzes: room.buzzes,
    players: Object.values(room.players).map(p => p.name),
    hasHost: !!room.hostId
  };
};

// Clean up empty rooms or disconnected users
const cleanupUser = (socketId) => {
  for (const [roomCode, room] of Object.entries(rooms)) {
    // Check if host
    if (room.hostId === socketId) {
      room.hostId = null;
      console.log(`Host disconnected from room ${roomCode}`);
      // Optional: Close room or wait for reclaim? 
      // For now, keep room open but notify.
    }
    
    // Check if player
    if (room.players[socketId]) {
      const name = room.players[socketId].name;
      delete room.players[socketId];
      console.log(`Player ${name} disconnected from room ${roomCode}`);
    }

    // Emit updated state
    io.to(roomCode).emit("room_update", getRoomState(roomCode));

    // If empty (no host, no players), delete room after timeout? 
    // For simplicity, just delete if completely empty immediately.
    if (!room.hostId && Object.keys(room.players).length === 0) {
      delete rooms[roomCode];
      console.log(`Room ${roomCode} deleted (empty)`);
    }
  }
};

io.on("connection", (socket) => {
  console.log("Connected:", socket.id);

  // --- JOIN ROOM ---
  socket.on("join_room", ({ room, name, role }) => {
    // Input validation
    if (!room || !name || !role) {
      return socket.emit("error", "Invalid join parameters.");
    }

    const roomCode = room.toUpperCase();
    
    // Initialize room if not exists
    if (!rooms[roomCode]) {
      rooms[roomCode] = {
        hostId: null,
        players: {},
        buzzes: [],
        isLocked: true, // Default to locked
      };
      console.log(`Created room: ${roomCode}`);
    }

    const currentRoom = rooms[roomCode];

    // Join Socket.io room
    socket.join(roomCode);

    // Update State based on Role
    if (role === 'HOST') {
      currentRoom.hostId = socket.id;
    } else {
      // PLAYER
      currentRoom.players[socket.id] = {
        name: name,
        joinedAt: Date.now()
      };
    }

    // Send initial state to everyone in room
    io.to(roomCode).emit("room_update", getRoomState(roomCode));
    console.log(`${name} (${role}) joined ${roomCode}`);
  });

  // --- BUZZ ---
  socket.on("buzz", ({ room }) => {
    if (!room) return;
    const roomCode = room.toUpperCase();
    const currentRoom = rooms[roomCode];

    if (!currentRoom) return socket.emit("error", "Room not found.");
    
    // Validation
    if (currentRoom.isLocked) {
      return socket.emit("error", "Buzzers are locked!"); 
    }

    // Check if player is in this room
    const player = currentRoom.players[socket.id];
    if (!player) return socket.emit("error", "You are not a player in this room.");

    // Check if player already buzzed
    const alreadyBuzzed = currentRoom.buzzes.find(b => b.socketId === socket.id);
    if (alreadyBuzzed) return; // Silent ignore

    // RECORD BUZZ
    const buzzEntry = {
      playerName: player.name,
      socketId: socket.id,
      timestamp: Date.now()
    };
    currentRoom.buzzes.push(buzzEntry);
    
    // Broadcast
    io.to(roomCode).emit("buzzed", buzzEntry); // Immediate feedback
    io.to(roomCode).emit("room_update", getRoomState(roomCode)); // Sync state
  });

  // --- CONTROLS: START / STOP / RESET ---
  socket.on("start_round", ({ room }) => {
    if (!room) return;
    const roomCode = room.toUpperCase();
    const currentRoom = rooms[roomCode];
    if (!currentRoom) return;
    if (currentRoom.hostId !== socket.id) return socket.emit("error", "Only host can start.");

    currentRoom.isLocked = false;
    io.to(roomCode).emit("room_update", getRoomState(roomCode));
    console.log(`Room ${roomCode} STARTED`);
  });

  socket.on("stop_round", ({ room }) => {
    if (!room) return;
    const roomCode = room.toUpperCase();
    const currentRoom = rooms[roomCode];
    if (!currentRoom) return;
    if (currentRoom.hostId !== socket.id) return socket.emit("error", "Only host can stop.");

    currentRoom.isLocked = true;
    io.to(roomCode).emit("room_update", getRoomState(roomCode));
    console.log(`Room ${roomCode} STOPPED`);
  });

  socket.on("reset", ({ room }) => {
    if (!room) return;
    const roomCode = room.toUpperCase();
    const currentRoom = rooms[roomCode];
    if (!currentRoom) return;
    if (currentRoom.hostId !== socket.id) return socket.emit("error", "Only host can reset.");

    currentRoom.buzzes = [];
    currentRoom.isLocked = true; // Reset implies returning to wait state
    
    io.to(roomCode).emit("reset_buzzer");
    io.to(roomCode).emit("room_update", getRoomState(roomCode));
    console.log(`Room ${roomCode} RESET`);
  });

  // --- DISCONNECT ---
  socket.on("disconnect", () => {
    cleanupUser(socket.id);
  });
});

// Catch-all handler to serve the React app
app.get(/.*/, (req, res) => {
  res.sendFile(path.join(__dirname, "client/dist", "index.html"));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
