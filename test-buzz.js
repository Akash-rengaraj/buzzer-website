const { io } = require("socket.io-client");
const { spawn } = require("child_process");

console.log("--- STARTING VERIFICATION TEST ---");

const server = spawn("node", ["server.js"]);
let serverOutput = "";

server.stdout.on("data", (data) => {
  serverOutput += data.toString();
  // console.log(`[SERVER]: ${data}`);
});

const URL = "http://localhost:3000";
const ROOM = "TESTROOM";

async function runTest() {
  console.log("Waiting for server to start...");
  await new Promise(resolve => setTimeout(resolve, 2000));

  const host = io(URL);
  const p1 = io(URL);
  const p2 = io(URL);

  try {
    // 1. Join
    console.log("Joining clients...");
    host.emit("join_room", { room: ROOM, name: "HostUser", role: "HOST" });
    p1.emit("join_room", { room: ROOM, name: "Player1", role: "PLAYER" });
    p2.emit("join_room", { room: ROOM, name: "Player2", role: "PLAYER" });

    // Wait for joins to process
    await new Promise(resolve => setTimeout(resolve, 500));

    // 2. Race Condition Simulation
    console.log("Simulating Buzz Race...");
    // P1 buzzes, then P2 buzzes 10ms later
    p1.emit("buzz", { room: ROOM });
    await new Promise(resolve => setTimeout(resolve, 10)); // tiny delay
    p2.emit("buzz", { room: ROOM });

    // Wait for responses
    await new Promise(resolve => setTimeout(resolve, 500));

    // 3. Verify State via Host
    // We can't easily peek into server memory without an API, but we can listen to 'room_update' on Host
    // Let's assume the last 'room_update' contains the result.
    // However, since we didn't hook listeners yet, let's just listen now and trigger an update.
    
    // Better: Promisify the state retrieval
    const statePromise = new Promise(resolve => {
      host.once("room_update", (state) => resolve(state));
    });
    
    // Trigger update by buzzing again (already buzzed, but emits update) or reset. 
    // Or just rely on the update sent after buzz.
    // Actually, socket.io clients might have missed the event if we didn't attach listener BEFORE.
    // Re-attach listener and asking for state... server doesn't have "get_state" event.
    // BUT the 'buzz' event broadcasts 'room_update'.
    
    // Let's restart the flow with listeners attached.
    
  } catch (e) {
    console.error("Setup failed", e);
  }
}

async function runRobustTest() {
  console.log("Waiting for server...");
  await new Promise(resolve => setTimeout(resolve, 2000));

  const client1 = io(URL);
  const client2 = io(URL);
  const host = io(URL);

  let state = null;
  host.on("room_update", (s) => {
    state = s;
  });

  host.emit("join_room", { room: ROOM, name: "HOST", role: "HOST" });
  client1.emit("join_room", { room: ROOM, name: "P1", role: "PLAYER" });
  client2.emit("join_room", { room: ROOM, name: "P2", role: "PLAYER" });

  await new Promise(r => setTimeout(r, 500));
  
  console.log("Buzzing P1...");
  client1.emit("buzz", { room: ROOM });
  
  await new Promise(r => setTimeout(r, 100));
  
  console.log("Buzzing P2...");
  client2.emit("buzz", { room: ROOM }); // Should be 2nd

  await new Promise(r => setTimeout(r, 500));

  if (!state) {
    console.error("FAIL: No state received.");
    process.exit(1);
  }

  console.log("Final State Buzzes:", state.buzzes);

  if (state.buzzes.length !== 2) {
    console.error("FAIL: Expected 2 buzzes.");
    process.exit(1);
  }

  if (state.buzzes[0].playerName !== "P1") {
    console.error("FAIL: P1 should be first.");
    process.exit(1);
  }
  
  console.log("SUCCESS: Buzz order preserved.");
  
  // Test Reset
  console.log("Testing Reset...");
  host.emit("reset", { room: ROOM });
  
  await new Promise(r => setTimeout(r, 500));
  
  if (state.buzzes.length !== 0) {
    console.error("FAIL: Reset did not clear buzzes.");
    process.exit(1);
  }
  
  console.log("SUCCESS: Reset worked.");
  
  client1.disconnect();
  client2.disconnect();
  host.disconnect();
  server.kill();
  process.exit(0);
}

runRobustTest();
