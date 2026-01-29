import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import confetti from 'canvas-confetti';
import './App.css';

// Initialize socket connection
const socket = io();

// Simple Avatar Generator based on name
const getAvatar = (name) => {
  const emojis = ['🐯', '🐼', '🐵', '🦄', '🐙', '🐸', '🦁', '🐨', '🦖', '🦋'];
  const index = name.length % emojis.length;
  return emojis[index];
};

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

  // Sounds
  // (In a real pro app, we'd preload these. For now we use visual only or browser speech maybe?)

  useEffect(() => {
    // Socket event listeners
    function onConnect() {
      setIsConnected(true);
    }

    function onDisconnect() {
      setIsConnected(false);
    }

    function onRoomUpdate(roomState) {
      if (!roomState) return;
      setPlayers(roomState.players || []);
      setBuzzes(roomState.buzzes || []);
      setIsLocked(roomState.isLocked);
    }
    
    function onBuzzed(newBuzz) {
      // Confetti ONLY if I am the host OR if I am the one who buzzed?
      // Let's do a small burst for everyone when someone buzzes
      const isMe = newBuzz.playerName === name;
      
      // If I am the winner (first buzz), big explosion
      // We need to know if this is the FIRST buzz. 
      // We can check buzzes.length in state, but state might be stale.
      // Ideally server sends "rank". 
      
      // Simple logic: fire confetti
      confetti({
        particleCount: 50,
        spread: 60,
        origin: { y: 0.7 },
        colors: ['#FF6B6B', '#4ECDC4', '#FFE66D']
      });
    }

    function onResetBuzzer() {
       // Maybe a "whoosh" sound
    }

    function onError(msg) {
      setErrorMsg(msg);
      // Shake effect usually done via CSS class toggle
      setTimeout(() => setErrorMsg(''), 3000); 
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
  }, [name]); // Re-bind if name changes, although name shouldn't change mid-game usually

  const joinRoom = (role) => {
    if (!room || !name) {
      setErrorMsg('Hey! We need your Name and a Room Code!');
      setTimeout(() => setErrorMsg(''), 3000);
      return;
    }
    socket.emit('join_room', { room, name, role });
    setGameState(role);
    
    // Celebration for joining!
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 }
    });
  };

  const handleBuzz = () => {
    socket.emit('buzz', { room });
    // Haptic feedback if on mobile (supported browsers)
    if (navigator.vibrate) navigator.vibrate(50);
  };

  const handleReset = () => {
    socket.emit('reset', { room });
  };
  
  const myBuzzIndex = buzzes.findIndex(b => b.playerName === name);
  const iHaveBuzzed = myBuzzIndex !== -1;

  if (!isConnected) {
    return (
      <div className="app-container">
        <div className="card">
          <h1>🔌 Connecting...</h1>
          <p>Hold on tight! Jumping into the server...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      {errorMsg && <div className="error-toast">⚠️ {errorMsg}</div>}
      
      {gameState === 'LOBBY' && (
        <div className="lobby card">
          <h1>🚀 Quiz Buzzer</h1>
          <p style={{marginBottom: '1rem', color: '#888'}}>Enter a code to start playing!</p>
          <input
            type="text"
            placeholder="Your Super Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={12}
          />
          <input
            type="text"
            placeholder="Room Code (e.g. ABC)"
            value={room}
            onChange={(e) => setRoom(e.target.value.toUpperCase())}
            maxLength={6}
          />
          <div className="buttons">
            <button onClick={() => joinRoom('HOST')}>👑 Host Game</button>
            <button onClick={() => joinRoom('PLAYER')}>🎮 Join Game</button>
          </div>
        </div>
      )}

      {gameState === 'HOST' && (
        <div className="host-view card">
          <div className="header-row">
            <h2>Room: {room}</h2>
            <div className="player-count">👥 {players.length}</div>
          </div>
          
          <div className="buzz-list">
            {buzzes.length === 0 ? (
              <div className="placeholder-text">
                <div style={{fontSize: '3rem', marginBottom: '1rem'}}>⏱️</div>
                Ready to race!
              </div>
            ) : (
              <ul>
                {buzzes.map((b, i) => (
                  <li key={i} className="buzz-item">
                    <div style={{display:'flex', alignItems:'center'}}>
                      <span className="rank">#{i + 1}</span>
                      <span style={{fontSize:'1.5rem', marginRight:'10px'}}>{getAvatar(b.playerName)}</span>
                      <span className="player-name">{b.playerName}</span>
                    </div>
                    <span className="time">{(i === 0) ? 'WINNER!' : `+${(b.timestamp - buzzes[0].timestamp)}ms`}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <button className="reset-btn" onClick={handleReset}>🔄 RESET ROUND</button>
        </div>
      )}

      {gameState === 'PLAYER' && (
        <div className="player-view">
          <div className="player-info">
            <h2>{getAvatar(name)} {name}</h2>
            <div style={{background: '#fff', padding: '0.5rem 1rem', borderRadius: '10px', display:'inline-block', marginTop:'0.5rem'}}>
              Room: <strong>{room}</strong>
            </div>
          </div>
          
          <button 
            className={`big-buzzer ${iHaveBuzzed ? 'disabled rank-show' : ''}`} 
            onClick={handleBuzz} 
            disabled={iHaveBuzzed || isLocked}
          >
            {iHaveBuzzed ? `#${myBuzzIndex + 1}` : 'BUZZ!'}
          </button>
        </div>
      )}
    </div>
  );
}

export default App;
