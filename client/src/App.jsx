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
  const [falseStarts, setFalseStarts] = useState([]);
  const [isLocked, setIsLocked] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const [pinDigits, setPinDigits] = useState([]);
  const [inputPos, setInputPos] = useState({ top: '60%', left: '50%', transform: 'translate(-50%, -50%)' });
  const [targetPin, setTargetPin] = useState('');
  const [currentInput, setCurrentInput] = useState('');

  // Refs for socket callbacks to avoid stale closures and constant re-binding
  const gameStateRef = useRef(gameState);
  const roomRef = useRef(room);
  const nameRef = useRef(name);
  const isLockedRef = useRef(isLocked);
  const targetPinRef = useRef(targetPin);

  useEffect(() => {
    gameStateRef.current = gameState;
    roomRef.current = room;
    nameRef.current = name;
    isLockedRef.current = isLocked;
    targetPinRef.current = targetPin;
  });

  useEffect(() => {
    // Socket event listeners
    function onConnect() {
      setIsConnected(true);
      // Auto-rejoin room if socket reconnects after dropping (very common on Render/mobile)
      const role = gameStateRef.current;
      const r = roomRef.current;
      const n = nameRef.current;
      if (role !== 'LOBBY' && r && n) {
        socket.emit('join_room', { room: r, name: n, role });
      }
    }

    function onDisconnect() {
      setIsConnected(false);
    }

    function onRoomUpdate(roomState) {
      if (!roomState) return;
      setPlayers(roomState.players || []);
      setBuzzes(roomState.buzzes || []);
      setFalseStarts(roomState.falseStarts || []);
      
      const wasLocked = isLockedRef.current;
      const hasNoPin = targetPinRef.current === '';

      // Teleport digits if transitioning from locked to unlocked, OR if joining an already unlocked room
      if (!roomState.isLocked && (wasLocked || hasNoPin)) {
        const padding = 15;
        
        // Define occupied areas to prevent overlaps
        const occupied = [];
        
        // Add middle card (approx 500x400 centered) ONLY if screen is large enough
        // On mobile, we let elements spawn over the center card because space is too limited.
        if (window.innerWidth > 600) {
          const cardW = 550, cardH = 450;
          const cardX = (window.innerWidth - cardW) / 2;
          const cardY = (window.innerHeight - cardH) / 2;
          occupied.push({ x: cardX, y: cardY, w: cardW, h: cardH });
        }
        
        const checkOverlap = (x, y, w, h) => {
          const gap = 10; // gap between elements
          for (let rect of occupied) {
            if (
              x < rect.x + rect.w + gap &&
              x + w + gap > rect.x &&
              y < rect.y + rect.h + gap &&
              y + h + gap > rect.y
            ) {
              return true; // overlaps
            }
          }
          return false;
        };

        const generatePos = (w, h) => {
          let x, y;
          let attempts = 0;
          // Clamp max bounds so they never become negative, which causes all elements to stack at (padding, padding)
          const maxW = Math.max(10, window.innerWidth - w - padding * 2);
          const maxH = Math.max(10, window.innerHeight - h - padding * 2);
          
          do {
            x = padding + Math.floor(Math.random() * maxW);
            y = padding + Math.floor(Math.random() * maxH);
            attempts++;
          } while (checkOverlap(x, y, w, h) && attempts < 100);
          
          occupied.push({ x, y, w, h });
          return { x, y };
        };

        // Generate Input box position FIRST (larger = harder to place)
        const inW = 180, inH = 150; // Use more realistic bounds
        const inputLoc = generatePos(inW, inH);
        setInputPos({
          top: `${inputLoc.y}px`,
          left: `${inputLoc.x}px`,
          position: 'fixed',
          transform: 'none',
          zIndex: 1000
        });

        // Generate 4 random digits in non-overlapping locations
        const pinW = 70, pinH = 80;
        let newPinStr = '';
        const digits = [];

        for (let i = 0; i < 4; i++) {
          const digit = Math.floor(Math.random() * 10).toString();
          newPinStr += digit;
          
          const loc = generatePos(pinW, pinH);
          
          digits.push({
            digit,
            order: i + 1,
            pos: {
              top: `${loc.y}px`,
              left: `${loc.x}px`,
              position: 'fixed',
              transform: 'none',
              zIndex: 1000
            }
          });
        }
        
        setTargetPin(newPinStr);
        setPinDigits(digits);
        setCurrentInput('');
      } else if (roomState.isLocked) {
        // Reset position when locked
        setPinDigits([]);
        setInputPos({ top: '60%', left: '50%', transform: 'translate(-50%, -50%)' });
        setTargetPin('');
        setCurrentInput('');
      }
      
      setIsLocked(roomState.isLocked);
    }
    
    function onBuzzed(newBuzz) {
      const isMe = newBuzz.playerName === name;
      confetti({
        particleCount: 50,
        spread: 60,
        origin: { y: 0.7 },
        colors: ['#FF6B6B', '#4ECDC4', '#FFE66D']
      });
    }

    function onResetBuzzer() {
       setPinDigits([]);
       setInputPos({ top: '60%', left: '50%', transform: 'translate(-50%, -50%)' });
       setTargetPin('');
       setCurrentInput('');
    }

    function onError(msg) {
      setErrorMsg(msg);
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
  }, []); // Empty dependency array because we use refs for state!

  const joinRoom = (role) => {
    if (!room || !name) {
      setErrorMsg('Hey! We need your Name and a Room Code!');
      setTimeout(() => setErrorMsg(''), 3000);
      return;
    }
    socket.emit('join_room', { room, name, role });
    setGameState(role);
    
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 }
    });
  };

  const handleBuzz = () => {
    // Check PIN validation if we are not locked and don't have a false start yet
    // and haven't buzzed.
    if (!isLocked && !iHaveFalseStart && !iHaveBuzzed) {
      if (currentInput !== targetPin) {
        setErrorMsg('INCORRECT PIN!');
        setTimeout(() => setErrorMsg(''), 2000);
        setCurrentInput(''); // Reset their input so they have to type again
        return;
      }
    }

    socket.emit('buzz', { room });
    if (navigator.vibrate) navigator.vibrate(50);
  };

  const handleStart = () => {
    socket.emit('start_round', { room });
  };

  const handleStop = () => {
    socket.emit('stop_round', { room });
  };

  const handleReset = () => {
    socket.emit('reset', { room });
  };
  
  const myBuzzIndex = buzzes.findIndex(b => b.playerName === name);
  const iHaveBuzzed = myBuzzIndex !== -1;
  const iHaveFalseStart = falseStarts.includes(name);

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

          <div className="player-list-host" style={{marginTop: '1rem', marginBottom: '1rem'}}>
            <h3 style={{fontSize: '1rem', color: '#666'}}>Joined Players:</h3>
            {players.length === 0 ? (
              <p style={{color: '#999', fontSize: '0.9rem'}}>No players joined yet.</p>
            ) : (
              <div style={{display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '8px'}}>
                {players.map((p, idx) => {
                  const hasFalseStart = falseStarts.includes(p);
                  return (
                    <span key={idx} style={{
                      background: hasFalseStart ? '#ffcccc' : '#f0f0f0', 
                      padding: '4px 10px', 
                      borderRadius: '15px', 
                      fontSize: '0.9rem', 
                      color: hasFalseStart ? '#cc0000' : '#333',
                      textDecoration: hasFalseStart ? 'line-through' : 'none'
                    }}>
                      {hasFalseStart && '🚫 '}
                      {getAvatar(p)} {p}
                    </span>
                  );
                })}
              </div>
            )}
          </div>
          
          <div className="buzz-list">
            {buzzes.length === 0 ? (
              <div className="placeholder-text">
                {isLocked ? (
                  <>
                    <div style={{fontSize: '3rem', marginBottom: '1rem'}}>🔒</div>
                    Buzzers Locked
                  </>
                ) : (
                  <>
                    <div style={{fontSize: '3rem', marginBottom: '1rem'}}>🟢</div>
                    Buzzers OPEN!
                  </>
                )}
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
          
          <div className="buttons-col">
            {!isLocked ? (
              <button 
                className="stop-btn" 
                onClick={handleStop}
                style={{background: '#FF4444', marginBottom: '1rem'}}
              >
                🛑 STOP ROUND
              </button>
            ) : (
               <button 
                className="start-btn" 
                onClick={handleStart}
                style={{background: '#6BCB77', marginBottom: '1rem'}}
              >
                🏁 START ROUND
              </button>
            )}
            
            <button className="reset-btn" onClick={handleReset}>🔄 COMPLETE RESET</button>
          </div>
        </div>
      )}

      {gameState === 'PLAYER' && (
        <div className="player-view">
          <div className="player-card">
            <div className="player-info">
              <h2>{getAvatar(name)} {name}</h2>
              <div style={{background: '#F0F0F0', padding: '0.5rem 1rem', borderRadius: '10px', display:'inline-block', marginTop:'0.5rem', color: '#555'}}>
                Room: <strong>{room}</strong>
              </div>
            </div>
            
            {/* Status Message */}
            <div className="status-message">
              {iHaveFalseStart ? (
                <>
                  <div className="lock-icon" style={{animation:'none'}}>🚫</div>
                  <div style={{color: '#ff4444'}}>FALSE START! Locked out this round.</div>
                </>
              ) : isLocked && !iHaveBuzzed ? (
                <>
                  <div className="lock-icon">🔒</div>
                  <div>Waiting for Host...</div>
                </>
              ) : iHaveBuzzed ? (
                <>
                  <div className="lock-icon" style={{animation:'none'}}>🎉</div>
                  <div>Buzz Registered!</div>
                </>
              ) : (
                <>
                  <div className="lock-icon" style={{animation:'bounce 0.5s infinite'}}>⚡</div>
                  <div style={{color: 'var(--primary)', fontSize:'2rem'}}>FIND THE BUZZER!</div>
                </>
              )}
            </div>

            {/* PIN Digits Display */}
            {(!isLocked && !iHaveBuzzed && !iHaveFalseStart) && pinDigits.map((d, idx) => (
              <div 
                key={idx}
                style={{
                  ...d.pos, 
                  background: 'var(--primary)', 
                  color: 'white', 
                  padding: '5px 10px', 
                  borderRadius: '10px', 
                  boxShadow: '0 5px 15px rgba(0,0,0,0.3)',
                  border: '3px solid var(--text-main)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minWidth: '50px',
                  minHeight: '60px'
                }}
              >
                <span style={{ fontSize: '0.8rem', color: '#ffe', marginBottom: '2px', fontWeight: 'bold' }}>
                  {['1st', '2nd', '3rd', '4th'][d.order - 1]}
                </span>
                <span style={{ fontSize: '2rem', fontWeight: '900', lineHeight: '1' }}>
                  {d.digit}
                </span>
              </div>
            ))}

            {/* Input & Buzzer */}
            {(!isLocked || iHaveBuzzed || iHaveFalseStart) && (
              <div
                className="input-buzzer-container"
                style={
                  iHaveFalseStart || iHaveBuzzed 
                    ? { marginTop: '2rem' } 
                    : {
                        ...inputPos,
                        background: 'white',
                        padding: '1rem',
                        borderRadius: '20px',
                        boxShadow: '0 10px 25px rgba(0,0,0,0.3)',
                        border: '4px solid var(--text-main)',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '10px'
                      }
                }
              >
                {(!isLocked && !iHaveBuzzed && !iHaveFalseStart) && (
                  <input
                    type="number"
                    placeholder="Enter PIN"
                    value={currentInput}
                    onChange={(e) => setCurrentInput(e.target.value)}
                    style={{ 
                      width: '100%', 
                      maxWidth: '180px',
                      textAlign: 'center', 
                      fontSize: '1.5rem', 
                      letterSpacing: '5px', 
                      marginBottom: '0',
                      borderRadius: '10px'
                    }}
                  />
                )}
                
                <button 
                  className={`big-buzzer ${iHaveBuzzed ? 'disabled rank-show' : ''} ${iHaveFalseStart ? 'disabled locked' : ''}`} 
                  onClick={handleBuzz} 
                  disabled={iHaveBuzzed || iHaveFalseStart}
                  style={
                    iHaveFalseStart 
                      ? {backgroundColor: '#555', boxShadow: '0 5px #333'} 
                      : iHaveBuzzed ? {} 
                      : { width: '150px', height: '150px', fontSize: '1.8rem', marginTop: '10px' }
                  }
                >
                  {iHaveBuzzed ? `#${myBuzzIndex + 1}` : (iHaveFalseStart ? 'LOCKED OUT' : 'BUZZ!')}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
