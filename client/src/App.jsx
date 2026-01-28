import React, { useState, useEffect } from 'react';
import io from 'socket.io-client';
import './App.css';

// Initialize socket connection to the same domain
const socket = io();

function App() {
  const [gameState, setGameState] = useState('LOBBY'); // LOBBY, HOST, PLAYER
  const [room, setRoom] = useState('');
  const [name, setName] = useState('');
  const [buzzes, setBuzzes] = useState([]);
  const [buzzed, setBuzzed] = useState(false); // Local state for player button connection

  useEffect(() => {
    // Socket event listeners
    socket.on('connect', () => {
      console.log('Connected to server');
    });

    socket.on('buzzed', (data) => {
      setBuzzes((prev) => [...prev, data]);
    });

    socket.on('reset_buzzer', () => {
      setBuzzes([]);
      setBuzzed(false);
    });

    return () => {
      socket.off('connect');
      socket.off('buzzed');
      socket.off('reset_buzzer');
    };
  }, []);

  const joinRoom = (role) => {
    if (!room || !name) return alert('Please enter both name and room');
    socket.emit('join_room', room);
    setGameState(role);
  };

  const handleBuzz = () => {
    if (!buzzed) {
      socket.emit('buzz', { room, playerName: name });
      setBuzzed(true);
    }
  };

  const handleReset = () => {
    socket.emit('reset', room);
  };

  return (
    <div className="app-container">
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
          <h2>Room: {room} (Host)</h2>
          <div className="buzz-list">
            {buzzes.length === 0 ? (
              <p>Waiting for buzzes...</p>
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
          <button className="reset-btn" onClick={handleReset}>RESET BUZZERS</button>
        </div>
      )}

      {gameState === 'PLAYER' && (
        <div className="player-view">
          <h2>Player: {name}</h2>
          <h3>Room: {room}</h3>
          
          <button 
            className={`big-buzzer ${buzzed ? 'disabled' : ''}`} 
            onClick={handleBuzz} 
            disabled={buzzed}
          >
            {buzzed ? 'BUZZED!' : 'BUZZ'}
          </button>
        </div>
      )}
    </div>
  );
}

export default App;
