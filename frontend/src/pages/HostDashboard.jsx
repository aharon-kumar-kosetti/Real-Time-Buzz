import React, { useState, useEffect } from 'react';
import { useSocket } from '../context/SocketContext';
import { apiService } from '../services/api';

const HostDashboard = () => {
  const { connect, disconnect, on, off } = useSocket();
  const [authState, setAuthState] = useState('login'); // 'login', 'dashboard'
  const [email, setEmail] = useState('host@housebuzz.local');
  const [password, setPassword] = useState('password123');
  const [error, setError] = useState('');

  // Game Data
  const [game, setGame] = useState(null);
  const [roundNumber, setRoundNumber] = useState(1);
  const [presentingHouse, setPresentingHouse] = useState('');
  
  // Realtime Data
  const [queue, setQueue] = useState([]);
  const [players, setPlayers] = useState([]);
  const [scores, setScores] = useState({});

  useEffect(() => {
    return () => {
      disconnect();
    };
  }, []);

  useEffect(() => {
    const handleQueueUpdate = (data) => setQueue(data.queue);
    const handleScoresUpdate = (data) => setScores(data.scores);
    const handlePlayerUpdate = async () => {
      if (game) {
        const p = await apiService.getConnectedPlayers(game.id);
        setPlayers(p);
      }
    };
    const handleStatusChange = async () => {
        if(game) {
            const status = await apiService.getGameStatus(game.id);
            setGame(status);
        }
    }

    on('buzz:queue-update', handleQueueUpdate);
    on('game:scores-update', handleScoresUpdate);
    on('player:connected', handlePlayerUpdate);
    on('players:update', handlePlayerUpdate);
    on('round:status-change', handleStatusChange);

    return () => {
      off('buzz:queue-update', handleQueueUpdate);
      off('game:scores-update', handleScoresUpdate);
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
      connect(data.id, 'host-admin', 'host');
    } catch (err) {
      alert(err.message);
    }
  };

  const handleStartGame = async () => {
    await apiService.startGame(game.id);
    const status = await apiService.getGameStatus(game.id);
    setGame(status);
  };

  const handleCreateRound = async () => {
    try {
      await apiService.createRound(game.id, roundNumber, presentingHouse);
      const status = await apiService.getGameStatus(game.id);
      setGame(status);
      setQueue([]);
    } catch (err) {
      alert(err.message);
    }
  };

  const handleOpenBuzzer = async () => {
    await apiService.openBuzzer(game.id, game.currentRound.id);
    const status = await apiService.getGameStatus(game.id);
    setGame(status);
  };

  const handleCloseBuzzer = async () => {
    await apiService.closeBuzzer(game.id, game.currentRound.id);
    const status = await apiService.getGameStatus(game.id);
    setGame(status);
  };

  const handleJudge = async (result) => {
    if (queue.length === 0) return;
    const player = queue[0];
    await apiService.markAnswer(game.id, game.currentRound.id, player.playerId, result);
    
    // Refresh queue after judging
    const status = await apiService.getGameStatus(game.id);
    setGame(status);
    if(status.currentRound) {
        const qData = await apiService.getQueue(game.id, status.currentRound.id);
        setQueue(qData);
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
        <div className="glass-panel" style={{ padding: '2rem', maxWidth: '400px', width: '100%' }}>
          <h2 className="text-center mb-4">Host Login</h2>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} />
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} />
          <button className="w-full mt-4" onClick={handleLogin}>Login</button>
          {error && <div className="mt-4 text-center text-error">{error}</div>}
        </div>
      </div>
    );
  }

  return (
    <div className="animate-pop-in">
      <div className="glass-panel flex justify-between items-center mb-4" style={{ padding: '1.5rem' }}>
        <h2>Host Control Panel</h2>
        <div>
          {!game ? (
            <button onClick={handleCreateGame}>Create Game</button>
          ) : (
            <button className="btn-outline" onClick={() => setGame(null)}>Leave Game View</button>
          )}
        </div>
      </div>

      {game && (
        <div className="flex-col gap-4">
          <div className="glass-panel" style={{ padding: '1.5rem' }}>
            <div className="flex justify-between items-center">
              <div>
                <h3 className="mb-2">Game: <span style={{letterSpacing: '0.1em', background:'rgba(255,255,255,0.1)', padding:'0.2rem 0.5rem', borderRadius:'4px'}}>{game.code}</span></h3>
                <p className="text-secondary">Status: {game.status}</p>
              </div>
              
              {game.status === 'WAITING' && (
                <button className="btn-success" onClick={handleStartGame}>Start Game</button>
              )}
            </div>

            {game.status === 'ACTIVE' && (
              <div className="flex gap-4 items-center mt-4 p-4 glass-card" style={{background: 'rgba(255,255,255,0.02)'}}>
                <input type="number" value={roundNumber} onChange={e => setRoundNumber(e.target.value)} style={{width: '100px', margin: 0}} />
                <select value={presentingHouse} onChange={e => setPresentingHouse(e.target.value)} style={{width: '150px', margin: 0}}>
                  <option value="">Presenting...</option>
                  <option value="PRUDHVI">PRUDHVI</option>
                  <option value="AGNI">AGNI</option>
                  <option value="JAL">JAL</option>
                  <option value="VAYU">VAYU</option>
                  <option value="AKASH">AKASH</option>
                </select>
                <button onClick={handleCreateRound}>Create Round</button>
              </div>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            {/* LEFT COLUMN */}
            <div className="flex-col gap-4">
              {game.currentRound && (
                <div className="glass-panel" style={{ padding: '1.5rem' }}>
                  <h3>Round {game.currentRound.roundNumber} Control</h3>
                  <p className="mb-4">Presenting: <span className={`house-badge house-${game.currentRound.presentingHouse}`}>{game.currentRound.presentingHouse}</span></p>
                  
                  <div className="flex gap-2">
                    <button className="btn-success flex-1" onClick={handleOpenBuzzer} disabled={game.currentRound.status === 'open'}>Open Buzzer</button>
                    <button className="btn-danger flex-1" onClick={handleCloseBuzzer} disabled={game.currentRound.status === 'closed'}>Close Buzzer</button>
                  </div>

                  {queue.length > 0 && (
                    <div className="mt-4 glass-card">
                      <h4>Judge Answer</h4>
                      <p className="mb-2">Answering: <strong>{queue[0].playerName}</strong></p>
                      <div className="flex gap-2">
                        <button className="btn-success flex-1" onClick={() => handleJudge('correct')}>Correct</button>
                        <button className="btn-danger flex-1" onClick={() => handleJudge('wrong')}>Wrong</button>
                        <button className="btn-outline flex-1" onClick={() => handleJudge('timeout')}>Timeout</button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="glass-panel" style={{ padding: '1.5rem' }}>
                <h3>Buzzer Queue</h3>
                {queue.length === 0 ? <p className="text-secondary">No one in queue</p> : (
                  <div className="flex-col gap-2">
                    {queue.map((q, idx) => (
                      <div key={q.playerId} className="glass-card flex justify-between" style={{ borderLeft: idx === 0 ? '4px solid var(--accent-primary)' : '' }}>
                        <span>{idx + 1}. {q.playerName}</span>
                        <span className={`house-badge house-${q.house}`}>{q.house}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* RIGHT COLUMN */}
            <div className="flex-col gap-4">
              <div className="glass-panel" style={{ padding: '1.5rem' }}>
                <h3>Live Scores</h3>
                <div className="flex-col gap-2">
                  {Object.keys(scores).length === 0 ? <p className="text-secondary">No scores yet</p> : 
                    Object.entries(scores).sort((a,b)=>b[1]-a[1]).map(([h,s]) => (
                      <div key={h} className="glass-card flex justify-between">
                        <span className={`house-badge house-${h}`}>{h}</span>
                        <strong>{s}</strong>
                      </div>
                    ))
                  }
                </div>
              </div>

              <div className="glass-panel" style={{ padding: '1.5rem' }}>
                <div className="flex justify-between items-center mb-4">
                    <h3>Players ({players.length})</h3>
                    <button className="btn-outline" style={{padding: '0.25rem 0.75rem'}} onClick={fetchPlayers}>Refresh</button>
                </div>
                <div className="flex-col gap-2" style={{ maxHeight: '200px', overflowY: 'auto' }}>
                  {players.map(p => (
                    <div key={p.id} className="glass-card flex justify-between items-center" style={{padding: '0.75rem'}}>
                      <div>
                        <div><strong>{p.name}</strong></div>
                        <div className="text-secondary" style={{fontSize:'0.8rem'}}>Connected: {p.connected ? 'Yes' : 'No'}</div>
                      </div>
                      <span className={`house-badge house-${p.house}`}>{p.house}</span>
                    </div>
                  ))}
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
