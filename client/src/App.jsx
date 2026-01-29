import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import './App.css';

// Initialize socket connection
// Using a ref or outside component variable is tricky if we want to handle disconnects/reconnects cleanly
// But for simplicity, we keep a global instance but manage listeners inside useEffect
const socket = io();

function App() {
  const [isConnected, setIsConnected] = useState(socket.connected);
  const [gameState, setGameState] = useState('LOBBY'); // LOBBY, HOST, PLAYER
  const [room, setRoom] = useState('');
  const [name, setName] = useState('');
  
  // Server State
  const [players, setPlayers] = useState([]);
  const [buzzes, setBuzzes] = useState([]);
  const [isLocked, setIsLocked] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    // Socket event listeners
    function onConnect() {
      setIsConnected(true);
      console.log('Connected to server');
    }

    function onDisconnect() {
      setIsConnected(false);
      console.log('Disconnected from server');
    }

    function onRoomUpdate(roomState) {
      if (!roomState) return;
      // Sync local state completely with server state
      setPlayers(roomState.players || []);
      setBuzzes(roomState.buzzes || []);
      setIsLocked(roomState.isLocked);
    }
    
    function onBuzzed(newBuzz) {
      // Optional: Add some visual flair or sound here
    }

    function onResetBuzzer() {
      // Optional: Sound effect for reset
    }

    function onError(msg) {
      setErrorMsg(msg);
      setTimeout(() => setErrorMsg(''), 3000); // Clear after 3s
    }

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('room_update', onRoomUpdate);
    socket.on('buzzed', onBuzzed);
    socket.on('reset_buzzer', onResetBuzzer);
    socket.on('error', onError);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('room_update', onRoomUpdate);
      socket.off('buzzed', onBuzzed);
      socket.off('reset_buzzer', onResetBuzzer);
      socket.off('error', onError);
    };
  }, []);

  const joinRoom = (role) => {
    if (!room || !name) return alert('Please enter both name and room');
    socket.emit('join_room', { room, name, role });
    setGameState(role);
  };

  const handleBuzz = () => {
    // Optimistic check? Or just emit.
    // Server handles the checks. Use button disabled state for UX.
    socket.emit('buzz', { room });
  };

  const handleReset = () => {
    socket.emit('reset', { room });
  };
  
  // Derived state for UI
  const myBuzzIndex = buzzes.findIndex(b => b.playerName === name);
  const iHaveBuzzed = myBuzzIndex !== -1;

  if (!isConnected) {
    return (
      <div className="app-container">
        <div className="card">
          <h1>Connecting...</h1>
          <p>Please wait while we connect to the server.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      {errorMsg && <div className="error-toast">{errorMsg}</div>}
      
      {gameState === 'LOBBY' && (
        <div className="lobby card">
          <h1>Quiz Buzzer</h1>
          <input
            type="text"
            placeholder="Enter Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            type="text"
            placeholder="Enter Room Code"
            value={room}
            onChange={(e) => setRoom(e.target.value.toUpperCase())}
          />
          <div className="buttons">
            <button onClick={() => joinRoom('HOST')}>Join as Host</button>
            <button onClick={() => joinRoom('PLAYER')}>Join as Player</button>
          </div>
        </div>
      )}

      {gameState === 'HOST' && (
        <div className="host-view card">
          <div className="header-row">
            <h2>Room: {room} (Host)</h2>
            <div className="player-count">Players: {players.length}</div>
          </div>
          
          <div className="buzz-list">
            {buzzes.length === 0 ? (
              <p className="placeholder-text">Waiting for buzzes...</p>
            ) : (
              <ul>
                {buzzes.map((b, i) => (
                  <li key={i} className="buzz-item">
                    <span className="rank">#{i + 1}</span>
                    <span className="player-name">{b.playerName}</span>
                    <span className="time">{new Date(b.timestamp).toLocaleTimeString().split(' ')[0]}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <button className="reset-btn" onClick={handleReset}>RESET ALL</button>
        </div>
      )}

      {gameState === 'PLAYER' && (
        <div className="player-view">
          <div className="player-info">
            <h2>{name}</h2>
            <p>Room: {room}</p>
          </div>
          
          <button 
            className={`big-buzzer ${iHaveBuzzed ? 'disabled' : ''}`} 
            onClick={handleBuzz} 
            disabled={iHaveBuzzed || isLocked}
          >
            {iHaveBuzzed ? `Rank: #${myBuzzIndex + 1}` : 'BUZZ'}
          </button>
        </div>
      )}
    </div>
  );
}

export default App;
