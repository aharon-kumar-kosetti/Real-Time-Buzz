import React, { useState, useEffect, useRef } from 'react';
import { useSocket } from '../context/SocketContext';
import { apiService } from '../services/api';

const generateRandomRoundId = () => Math.floor(1000 + Math.random() * 9000);

const HostDashboard = () => {
  const { connect, disconnect, on, off } = useSocket();
  const [authState, setAuthState] = useState('login'); // 'login', 'dashboard'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  // Game Data
  const [game, setGame] = useState(null);
  const [roundNumber, setRoundNumber] = useState(generateRandomRoundId());
  const [presentingHouse, setPresentingHouse] = useState('ALL');
  const [buzzerTimerSecs, setBuzzerTimerSecs] = useState(10);
  const [countdown, setCountdown] = useState(null);
  
  // Realtime Data
  const [queue, setQueue] = useState([]);
  const [players, setPlayers] = useState([]);

  const timerIntervalRef = useRef(null);

  useEffect(() => {
    const token = apiService.getToken();
    if (token) {
      apiService.getMe()
        .then(() => {
          setAuthState('dashboard');
          // Restore game if saved
          const savedGame = localStorage.getItem('host_active_game');
          if (savedGame) {
            try {
              const parsed = JSON.parse(savedGame);
              if (parsed && parsed.id) {
                apiService.getGameStatus(parsed.id)
                  .then(status => {
                    setGame(status);
                    connect(status.id, 'host-admin', 'host');
                    if (status.currentRound) {
                      setPresentingHouse(status.currentRound.presentingHouse || 'ALL');
                      apiService.getQueue(status.id, status.currentRound.id).then(setQueue).catch(console.error);
                    }
                    apiService.getConnectedPlayers(status.id).then(setPlayers).catch(console.error);
                  })
                  .catch(() => {
                    localStorage.removeItem('host_active_game');
                  });
              }
            } catch (e) {
              console.error(e);
            }
          }
        })
        .catch(() => {
          apiService.logout();
          setAuthState('login');
        });
    }
    return () => {
      disconnect();
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('host_active_game');
    apiService.logout();
    disconnect();
    setGame(null);
    setAuthState('login');
  };

  useEffect(() => {
    const handleQueueUpdate = async (data) => {
      if (Array.isArray(data?.queue)) {
        setQueue(data.queue);
      } else if (data && data.roundId && game?.id) {
        try {
          const qData = await apiService.getQueue(game.id, data.roundId);
          setQueue(qData);
        } catch (e) {
          console.error(e);
        }
      }
    };

    const handlePlayerUpdate = async () => {
      if (game) {
        const p = await apiService.getConnectedPlayers(game.id);
        setPlayers(p);
      }
    };

    const handleStatusChange = async (data) => {
      if (game) {
        const status = await apiService.getGameStatus(game.id);
        setGame(status);
        if (status.currentRound) {
          const qData = await apiService.getQueue(game.id, status.currentRound.id);
          setQueue(qData);
        }
      }

      if (data?.status === 'BUZZER_OPEN' && data?.duration) {
        setCountdown(data.duration);
        if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = setInterval(() => {
          setCountdown(prev => {
            if (prev === null || prev <= 1) {
              clearInterval(timerIntervalRef.current);
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
      } else if (data?.status === 'BUZZER_LOCKED' || data?.status === 'COMPLETED') {
        setCountdown(null);
        if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      }
    };

    on('buzz:queue-update', handleQueueUpdate);
    on('player:connected', handlePlayerUpdate);
    on('players:update', handlePlayerUpdate);
    on('round:status-change', handleStatusChange);

    return () => {
      off('buzz:queue-update', handleQueueUpdate);
      off('player:connected', handlePlayerUpdate);
      off('players:update', handlePlayerUpdate);
      off('round:status-change', handleStatusChange);
    };
  }, [game, on, off]);

  const handleLogin = async () => {
    try {
      setError('');
      await apiService.login(email, password);
      setAuthState('dashboard');
    } catch (err) {
      setError(err.message);
    }
  };

  const handleCreateGame = async () => {
    try {
      const data = await apiService.createGame();
      setGame(data);
      localStorage.setItem('host_active_game', JSON.stringify(data));
      connect(data.id, 'host-admin', 'host');
    } catch (err) {
      alert(err.message);
    }
  };

  const handleStartGame = async () => {
    await apiService.startGame(game.id);
    const status = await apiService.getGameStatus(game.id);
    setGame(status);
    localStorage.setItem('host_active_game', JSON.stringify(status));
  };

  const handleCreateRound = async () => {
    try {
      const currentRandomId = roundNumber;
      await apiService.createRound(game.id, currentRandomId, presentingHouse);
      const status = await apiService.getGameStatus(game.id);
      setGame(status);
      localStorage.setItem('host_active_game', JSON.stringify(status));
      setQueue([]);
      setCountdown(null);
      // Generate next random round ID
      setRoundNumber(generateRandomRoundId());
    } catch (err) {
      alert(err.message);
    }
  };

  const handleOpenBuzzer = async () => {
    try {
      const duration = buzzerTimerSecs > 0 ? buzzerTimerSecs : null;
      await apiService.openBuzzer(game.id, game.currentRound.id, duration);
      const status = await apiService.getGameStatus(game.id);
      setGame(status);
      if (duration) {
        setCountdown(duration);
        if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = setInterval(() => {
          setCountdown(prev => {
            if (prev === null || prev <= 1) {
              clearInterval(timerIntervalRef.current);
              handleCloseBuzzer(); // auto close when timer ends
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
      }
    } catch (err) {
      alert(err.message);
    }
  };

  const handleCloseBuzzer = async () => {
    try {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      setCountdown(null);
      await apiService.closeBuzzer(game.id, game.currentRound.id);
      const status = await apiService.getGameStatus(game.id);
      setGame(status);
      // Preserve existing queue!
      if (status.currentRound) {
        const qData = await apiService.getQueue(game.id, status.currentRound.id);
        setQueue(qData);
      }
    } catch (err) {
      alert(err.message);
    }
  };

  const handleResetBuzzer = async () => {
    try {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      setCountdown(null);
      await apiService.resetBuzzer(game.id, game.currentRound.id);
      setQueue([]);
      const status = await apiService.getGameStatus(game.id);
      setGame(status);
    } catch (err) {
      alert(err.message);
    }
  };

  const handleJudge = async (result) => {
    if (queue.length === 0) return;
    const player = queue[0];
    await apiService.markAnswer(game.id, game.currentRound.id, player.playerId, result.toUpperCase());
    
    // Refresh queue and status after judging
    const status = await apiService.getGameStatus(game.id);
    setGame(status);
    if (status.currentRound) {
      const qData = await apiService.getQueue(game.id, status.currentRound.id);
      setQueue(qData);
    } else {
      setQueue([]);
    }
  };

  const fetchPlayers = async () => {
    if (game) {
      const p = await apiService.getConnectedPlayers(game.id);
      setPlayers(p);
    }
  };

  if (authState === 'login') {
    return (
      <div className="flex-col items-center justify-center animate-slide-up" style={{ minHeight: '80vh' }}>
        <form 
          className="glass-panel" 
          style={{ padding: '2rem', maxWidth: '400px', width: '100%' }}
          onSubmit={(e) => { e.preventDefault(); handleLogin(); }}
        >
          <h2 className="text-center mb-4">Host Login</h2>
          <input 
            type="text" 
            placeholder="Username or Email"
            value={email} 
            onChange={e => setEmail(e.target.value)} 
          />
          <input 
            type="password" 
            placeholder="Password"
            value={password} 
            onChange={e => setPassword(e.target.value)} 
          />
          <button type="submit" className="w-full mt-4">Login</button>
          {error && <div className="mt-4 text-center text-error">{error}</div>}
        </form>
      </div>
    );
  }

  const isBuzzerOpen = game?.currentRound?.status === 'BUZZER_OPEN' || game?.currentRound?.status === 'open';

  return (
    <div className="animate-pop-in">
      <div className="glass-panel flex justify-between items-center mb-4" style={{ padding: '1.5rem' }}>
        <h2>Host Control Panel</h2>
        <div className="flex gap-2">
          {!game ? (
            <button onClick={handleCreateGame}>Create Game</button>
          ) : (
            <button className="btn-outline" onClick={() => { setGame(null); localStorage.removeItem('host_active_game'); }}>Leave Game View</button>
          )}
          <button className="btn-outline" onClick={handleLogout}>Logout</button>
        </div>
      </div>

      {game && (
        <div className="flex-col gap-4">
          {/* Game Status & Setup Panel */}
          <div className="glass-panel" style={{ padding: '1.5rem' }}>
            <div className="flex justify-between items-center">
              <div>
                <h3 className="mb-2">House Join Codes</h3>
                {Object.keys(game.houseCodes || {}).length > 0 && (
                  <div className="flex gap-2 flex-wrap" style={{marginTop: '0.75rem'}}>
                    {Object.entries(game.houseCodes).map(([house, code]) => (
                      <span key={house} className={`house-badge house-${house}`} title={`${house} join code`}>
                        {house}: {code}
                      </span>
                    ))}
                  </div>
                )}
                <p className="text-secondary">Game Status: <strong style={{color: game.status === 'ACTIVE' ? 'var(--success)' : 'inherit'}}>{game.status}</strong></p>
              </div>
              
              {game.status === 'LOBBY' && (
                <button className="btn-success" style={{fontSize: '1.1rem', padding: '0.75rem 1.5rem'}} onClick={handleStartGame}>Start Game</button>
              )}
            </div>

            {game.status === 'ACTIVE' && (
              <div className="flex gap-4 items-center flex-wrap mt-4 p-4 glass-card" style={{background: 'rgba(255,255,255,0.02)'}}>
                <div style={{minWidth: '150px'}}>
                  <label style={{fontSize: '0.8rem', display: 'block', color: 'var(--text-secondary)'}}>Random Round ID</label>
                  <div className="flex items-center gap-2">
                    <span style={{fontWeight: 800, fontSize: '1.1rem', background: 'rgba(255,255,255,0.08)', padding: '0.4rem 0.75rem', borderRadius: '6px'}}>#{roundNumber}</span>
                    <button type="button" className="btn-outline" style={{padding: '0.4rem 0.6rem', fontSize: '0.8rem'}} onClick={() => setRoundNumber(generateRandomRoundId())} title="Generate new random Round ID">🎲</button>
                  </div>
                </div>

                <div style={{minWidth: '220px'}}>
                  <label style={{fontSize: '0.8rem', display: 'block', color: 'var(--text-secondary)'}}>Buzz Rule / Presenter</label>
                  <select value={presentingHouse} onChange={e => setPresentingHouse(e.target.value)} style={{width: '100%', margin: 0}}>
                    <option value="ALL">🌟 ALL TEAMS (Open to Everyone)</option>
                    <option value="PRUDHVI">🌍 PRUDHVI (Prudhvi Presents)</option>
                    <option value="AGNI">🔥 AGNI (Agni Presents)</option>
                    <option value="JAL">💧 JAL (Jal Presents)</option>
                    <option value="VAYU">🌬️ VAYU (Vayu Presents)</option>
                    <option value="AKASH">✨ AKASH (Akash Presents)</option>
                  </select>
                </div>

                <div style={{minWidth: '160px'}}>
                  <label style={{fontSize: '0.8rem', display: 'block', color: 'var(--text-secondary)'}}>Timer Duration</label>
                  <select value={buzzerTimerSecs} onChange={e => setBuzzerTimerSecs(parseInt(e.target.value, 10))} style={{width: '100%', margin: 0}}>
                    <option value={0}>♾️ No Timer (Manual Stop)</option>
                    <option value={5}>⏱️ 5 Seconds</option>
                    <option value={10}>⏱️ 10 Seconds</option>
                    <option value={15}>⏱️ 15 Seconds</option>
                    <option value={30}>⏱️ 30 Seconds</option>
                  </select>
                </div>

                <div style={{marginTop: 'auto'}}>
                  <button onClick={handleCreateRound} style={{padding: '0.75rem 1.25rem'}}>
                    {game.currentRound ? 'Create Next Round' : 'Create Round'}
                  </button>
                </div>
              </div>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 0.6fr', gap: '1rem' }}>
            {/* LEFT COLUMN: ACTIVE ROUND & BUZZER CONTROLS */}
            <div className="flex-col gap-4">
              {game.currentRound ? (
                <div className="glass-panel" style={{ padding: '1.5rem', border: isBuzzerOpen ? '2px solid var(--success)' : '1px solid rgba(255,255,255,0.1)' }}>
                  <div className="flex justify-between items-center mb-3">
                    <h3>Round #{game.currentRound.roundNumber} Control</h3>
                    {countdown !== null && (
                      <div className="animate-pulse" style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--warning)', background: 'rgba(234, 179, 8, 0.15)', padding: '0.2rem 0.75rem', borderRadius: '8px' }}>
                        ⏳ {countdown}s remaining
                      </div>
                    )}
                  </div>
                  
                  <p className="mb-4">
                    Mode: {game.currentRound.presentingHouse === 'ALL' ? (
                      <span className="house-badge" style={{background: 'var(--accent-primary)', color: '#fff'}}>🌟 OPEN TO ALL HOUSES</span>
                    ) : (
                      <span>Presenting: <span className={`house-badge house-${game.currentRound.presentingHouse}`}>{game.currentRound.presentingHouse}</span></span>
                    )}
                    <span className="ml-4 text-secondary" style={{marginLeft: '1rem'}}>
                      Status: <strong style={{color: isBuzzerOpen ? 'var(--success)' : 'inherit'}}>{isBuzzerOpen ? 'BUZZER OPEN' : 'BUZZER LOCKED'}</strong>
                    </span>
                  </p>
                  
                  {/* Action Buttons: Open, Stop (Permanent), Reset */}
                  <div className="flex gap-2 mb-4">
                    <button 
                      className="btn-success flex-1" 
                      onClick={handleOpenBuzzer} 
                      disabled={isBuzzerOpen}
                      style={{ fontSize: '1.1rem', padding: '0.85rem' }}
                    >
                      ⚡ Open Buzzer {buzzerTimerSecs > 0 ? `(${buzzerTimerSecs}s)` : ''}
                    </button>

                    <button 
                      className="btn-danger flex-1" 
                      onClick={handleCloseBuzzer} 
                      style={{ fontSize: '1.1rem', padding: '0.85rem' }}
                    >
                      🛑 Stop Buzzer
                    </button>

                    <button 
                      className="btn-outline" 
                      onClick={handleResetBuzzer}
                      title="Clear queue and reset buzzer for this round"
                      style={{ padding: '0.85rem 1.2rem' }}
                    >
                      🔄 Reset
                    </button>
                  </div>

                  {/* Answering Player & Judging */}
                  {queue.length > 0 && (
                    <div className="p-4 glass-card" style={{ background: 'rgba(99, 102, 241, 0.1)', border: '1px solid var(--accent-primary)', borderRadius: '12px' }}>
                      <h4 style={{ color: 'var(--accent-primary)', marginBottom: '0.5rem' }}>🎯 Answering Now</h4>
                      <div className="flex justify-between items-center mb-3">
                        <span style={{ fontSize: '1.3rem', fontWeight: 800 }}>{queue[0].playerName}</span>
                        <span className={`house-badge house-${queue[0].house}`} style={{ fontSize: '1rem' }}>{queue[0].house}</span>
                      </div>
                      <div className="flex gap-2">
                        <button className="btn-success flex-1" onClick={() => handleJudge('CORRECT')}>✅ Correct</button>
                        <button className="btn-danger flex-1" onClick={() => handleJudge('WRONG')}>❌ Wrong</button>
                        <button className="btn-outline flex-1" onClick={() => handleJudge('TIMEOUT')}>⏰ Timeout</button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="glass-panel text-center py-6">
                  <p className="text-secondary">No active round yet. Click Create Round above to begin buzzing!</p>
                </div>
              )}

              {/* Buzzer Queue Display (Unlimited) */}
              <div className="glass-panel" style={{ padding: '1.5rem' }}>
                <div className="flex justify-between items-center mb-3">
                  <h3>Buzzer Queue ({queue.length})</h3>
                  {queue.length > 0 && <button className="btn-outline" style={{padding: '0.2rem 0.6rem', fontSize: '0.8rem'}} onClick={handleResetBuzzer}>Clear Queue</button>}
                </div>

                {queue.length === 0 ? (
                  <p className="text-secondary py-3 text-center">No one in queue. Buzzers are waiting!</p>
                ) : (
                  <div className="flex-col gap-2" style={{ maxHeight: '400px', overflowY: 'auto' }}>
                    {queue.map((q, idx) => (
                      <div 
                        key={q.playerId || idx} 
                        className="glass-card flex justify-between items-center" 
                        style={{ 
                          padding: '0.75rem 1rem', 
                          borderLeft: idx === 0 ? '4px solid var(--accent-primary)' : '4px solid rgba(255,255,255,0.2)',
                          background: idx === 0 ? 'rgba(99, 102, 241, 0.12)' : 'rgba(255,255,255,0.03)'
                        }}
                      >
                        <div className="flex items-center gap-3">
                          <strong style={{ fontSize: '1.2rem', color: idx === 0 ? 'var(--accent-primary)' : 'inherit' }}>#{idx + 1}</strong>
                          <div>
                            <div style={{ fontWeight: 600 }}>{q.playerName}</div>
                            {idx === 0 && <span style={{ fontSize: '0.75rem', color: 'var(--success)', fontWeight: 700 }}>ANSWERING</span>}
                          </div>
                        </div>
                        <span className={`house-badge house-${q.house}`}>{q.house}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* RIGHT COLUMN: PLAYERS (House Points section hidden) */}
            <div className="flex-col gap-4">
              <div className="glass-panel" style={{ padding: '1.5rem' }}>
                <div className="flex justify-between items-center mb-3">
                  <h3>Connected Players ({players.length})</h3>
                  <button className="btn-outline" style={{padding: '0.25rem 0.75rem'}} onClick={fetchPlayers}>Refresh</button>
                </div>
                <div className="flex-col gap-2" style={{ maxHeight: '450px', overflowY: 'auto' }}>
                  {players.length === 0 ? (
                    <p className="text-secondary text-center py-2">No players connected yet</p>
                  ) : (
                    players.map(p => (
                      <div key={p.id} className="glass-card flex justify-between items-center" style={{padding: '0.65rem 0.9rem'}}>
                        <div>
                          <div><strong>{p.name}</strong></div>
                          <div className="text-secondary" style={{fontSize:'0.75rem'}}>Status: {p.connected ? '🟢 Online' : '⚪ Offline'}</div>
                        </div>
                        <span className={`house-badge house-${p.house}`}>{p.house}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default HostDashboard;
