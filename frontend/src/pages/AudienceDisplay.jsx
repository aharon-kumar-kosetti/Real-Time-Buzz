import React, { useState, useEffect } from 'react';
import { useSocket } from '../context/SocketContext';
import { apiService } from '../services/api';

const AudienceDisplay = () => {
  const { connect, disconnect, on, off } = useSocket();
  const [setupMode, setSetupMode] = useState(true);
  const [gameCode, setGameCode] = useState('');
  const [error, setError] = useState('');

  const [gameStatus, setGameStatus] = useState(null);
  const [scores, setScores] = useState({});
  const [queue, setQueue] = useState([]);
  
  const [firstBuzzPulse, setFirstBuzzPulse] = useState(false);

  useEffect(() => {
    return () => disconnect();
  }, []);

  useEffect(() => {
    const handleScoresUpdate = (data) => setScores(data.scores);
    const handleQueueUpdate = (data) => {
      setQueue(data.queue);
      if (data.queue.length === 1) {
        // Trigger pulse animation for first buzz
        setFirstBuzzPulse(false);
        setTimeout(() => setFirstBuzzPulse(true), 10);
      }
    };
    const handleStatusChange = async (data) => {
        if(gameStatus) {
            const status = await apiService.getGameStatus(gameStatus.id);
            setGameStatus(status);
            if(data.status === 'closed') setQueue([]);
        }
    }

    on('game:scores-update', handleScoresUpdate);
    on('buzz:queue-update', handleQueueUpdate);
    on('round:status-change', handleStatusChange);

    return () => {
      off('game:scores-update', handleScoresUpdate);
      off('buzz:queue-update', handleQueueUpdate);
      off('round:status-change', handleStatusChange);
    };
  }, [gameStatus, on, off]);

  const handleConnect = async () => {
    try {
      setError('');
      // We don't have a direct "join as display" API, but we can try to fetch game status
      // A quick hack is to login as host, or just assume public endpoints work.
      // Wait, we need an auth token to fetch status if it's protected.
      // Looking at the original code, `api.js` had `getGameStatus(gameId)`, but gameId isn't code.
      // We need to fetch the game by code. The backend doesn't have a public GET /games/:code.
      // Actually, joining a game returns the gameId. 
      // I will join as a "Display" player secretly.
      const data = await apiService.joinGame(gameCode.toUpperCase(), 'Display', 'PRUDHVI');
      
      const status = await apiService.getGameStatus(data.player.gameId);
      setGameStatus(status);
      
      const scoreData = await apiService.getScores(data.player.gameId);
      setScores(scoreData);

      connect(data.player.gameId, data.player.id, 'display');
      setSetupMode(false);
    } catch (err) {
      setError(err.message || 'Failed to connect. Make sure the code is correct.');
    }
  };

  if (setupMode) {
    return (
      <div className="flex-col items-center justify-center animate-slide-up" style={{ minHeight: '80vh' }}>
        <div className="glass-panel text-center" style={{ padding: '3rem', maxWidth: '500px', width: '100%' }}>
          <h2 className="mb-4">Configure Display</h2>
          <input 
            type="text" 
            placeholder="Game Code" 
            value={gameCode}
            onChange={e => setGameCode(e.target.value)}
            style={{ fontSize: '2rem', textAlign: 'center', textTransform: 'uppercase' }}
          />
          <button className="w-full mt-4" style={{ fontSize: '1.5rem', padding: '1rem' }} onClick={handleConnect}>Connect Display</button>
          {error && <div className="mt-4 text-error">{error}</div>}
        </div>
      </div>
    );
  }

  const firstInQueue = queue.length > 0 ? queue[0] : null;

  return (
    <div className="animate-pop-in flex-col" style={{ height: '100vh', padding: '0', overflow: 'hidden' }}>
      
      {/* Header */}
      <div className="glass-panel" style={{ borderRadius: 0, borderTop: 'none', borderLeft: 'none', borderRight: 'none', padding: '1rem 2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="flex gap-4 items-center">
          <h1 style={{ margin: 0, fontSize: '2rem' }}>HOUSE BUZZ</h1>
          <span style={{letterSpacing: '0.1em', background:'rgba(255,255,255,0.1)', padding:'0.2rem 0.5rem', borderRadius:'4px', fontWeight: 'bold', fontSize: '1.2rem'}}>CODE: {gameCode}</span>
        </div>
        <div className="flex gap-4 items-center">
          <span className="text-secondary">ROUND {gameStatus?.currentRound?.roundNumber || '-'}</span>
          <span className={`house-badge ${gameStatus?.currentRound?.presentingHouse ? 'house-' + gameStatus.currentRound.presentingHouse : ''}`} style={{ fontSize: '1.2rem' }}>
            {gameStatus?.currentRound?.presentingHouse || 'WAITING...'}
          </span>
        </div>
      </div>

      <div className="flex flex-1" style={{ padding: '2rem', gap: '2rem' }}>
        
        {/* Center Main Area */}
        <div className="glass-panel flex-1 flex-col items-center justify-center relative" style={{ overflow: 'hidden' }}>
          {firstInQueue ? (
            <div className={`text-center ${firstBuzzPulse ? 'animate-pop-in' : ''}`} style={{ zIndex: 10 }}>
              <div className="text-warning mb-4" style={{ fontSize: '2rem', fontWeight: 800 }}>🏆 FIRST BUZZ! 🏆</div>
              <div className={`house-badge house-${firstInQueue.house} mb-4`} style={{ fontSize: '3rem', padding: '1rem 3rem' }}>
                {firstInQueue.house}
              </div>
              <div style={{ fontSize: '4rem', fontWeight: 800 }}>{firstInQueue.playerName}</div>
              <div className="text-accent-primary mt-4 animate-pulse" style={{ fontSize: '2rem', fontWeight: 800 }}>ANSWERING NOW...</div>
            </div>
          ) : (
             <div className="text-secondary" style={{ fontSize: '2rem' }}>Waiting for buzzers...</div>
          )}
          
          {/* Background Glow */}
          {firstInQueue && (
             <div 
               style={{
                 position: 'absolute',
                 top: '50%', left: '50%',
                 transform: 'translate(-50%, -50%)',
                 width: '600px', height: '600px',
                 background: `radial-gradient(circle, var(--house-${firstInQueue.house.toLowerCase()}) 0%, transparent 70%)`,
                 opacity: 0.15,
                 zIndex: 0
               }}
             />
          )}
        </div>

        {/* Right Sidebar - Queue & Scores */}
        <div className="flex-col gap-4" style={{ width: '400px' }}>
          
          <div className="glass-panel flex-1" style={{ padding: '1.5rem' }}>
            <h3 className="mb-4 text-center">Queue Tracker</h3>
            <div className="flex-col gap-3">
              {[1, 2, 3, 4].map(slot => {
                const qItem = queue[slot]; // slot 0 is first buzz, so queue[1] is 2nd
                return (
                  <div key={slot} className="glass-card flex items-center gap-4" style={{ padding: '1rem' }}>
                    <span className="text-secondary" style={{ fontSize: '1.5rem', fontWeight: 800 }}>{slot + 1}</span>
                    {qItem ? (
                      <div>
                        <div style={{ fontSize: '1.2rem', fontWeight: 600 }}>{qItem.playerName}</div>
                        <div className={`house-badge house-${qItem.house}`} style={{ fontSize: '0.7rem' }}>{qItem.house}</div>
                      </div>
                    ) : (
                      <div className="text-secondary">Waiting...</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="glass-panel" style={{ padding: '1.5rem' }}>
            <h3 className="mb-4 text-center">Live Scores</h3>
            <div className="flex-col gap-2">
              {Object.entries(scores).sort((a,b)=>b[1]-a[1]).map(([h,s]) => (
                <div key={h} className="flex justify-between items-center glass-card" style={{ padding: '0.75rem 1rem' }}>
                  <span className={`house-badge house-${h}`}>{h}</span>
                  <strong style={{ fontSize: '1.5rem' }}>{s}</strong>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

export default AudienceDisplay;
