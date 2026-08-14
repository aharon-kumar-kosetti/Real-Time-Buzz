import React, { useState, useEffect } from 'react';
import { useSocket } from '../context/SocketContext';
import { apiService } from '../services/api';

const StudentView = () => {
  const { connect, disconnect, on, off } = useSocket();
  const [gameState, setGameState] = useState('join'); // 'join', 'waiting', 'playing'
  const [error, setError] = useState('');
  
  // Join form state
  const [gameCode, setGameCode] = useState('');
  const [name, setName] = useState('');
  const [house, setHouse] = useState('');
  
  // Game state
  const [playerData, setPlayerData] = useState(null);
  const [roundStatus, setRoundStatus] = useState('closed'); // 'open', 'closed'
  const [queuePos, setQueuePos] = useState(null);
  const [scores, setScores] = useState({});

  useEffect(() => {
    return () => {
      disconnect();
    };
  }, []);

  useEffect(() => {
    const handleStatusChange = (data) => {
      setRoundStatus(data.status);
      if (data.status === 'closed') {
        setQueuePos(null);
      }
    };

    const handleQueueUpdate = (data) => {
      if (!playerData) return;
      const myPos = data.queue.findIndex(item => item.playerId === playerData.id);
      if (myPos !== -1) {
        setQueuePos(myPos + 1);
      } else {
        setQueuePos(null);
      }
    };

    const handleScoresUpdate = (data) => {
      setScores(data.scores);
    };

    const handleAnswerResult = (data) => {
      if (data.result === 'correct') {
        setRoundStatus('closed');
        setQueuePos(null);
      }
    };

    on('round:status-change', handleStatusChange);
    on('buzz:queue-update', handleQueueUpdate);
    on('game:scores-update', handleScoresUpdate);
    on('answer:result', handleAnswerResult);

    return () => {
      off('round:status-change', handleStatusChange);
      off('buzz:queue-update', handleQueueUpdate);
      off('game:scores-update', handleScoresUpdate);
      off('answer:result', handleAnswerResult);
    };
  }, [playerData, on, off]);

  const handleJoin = async () => {
    try {
      setError('');
      const data = await apiService.joinGame(gameCode.toUpperCase(), name, house);
      setPlayerData(data.player);
      connect(data.player.gameId, data.player.id, 'player');
      
      // Fetch initial scores
      const scoreData = await apiService.getScores(data.player.gameId);
      setScores(scoreData);
      
      setGameState('playing');
    } catch (err) {
      setError(err.message);
    }
  };

  const handleBuzz = async () => {
    if (roundStatus !== 'open' || !playerData) return;
    try {
      // Get current status again before buzzing just to be sure
      const statusRes = await apiService.getGameStatus(playerData.gameId);
      if (statusRes.currentRound) {
         await apiService.buzz(playerData.gameId, statusRes.currentRound.id);
      }
    } catch (err) {
      console.error(err);
    }
  };

  if (gameState === 'join') {
    return (
      <div className="flex-col items-center justify-center animate-slide-up" style={{ minHeight: '80vh' }}>
        <div className="glass-panel" style={{ padding: '2rem', maxWidth: '400px', width: '100%' }}>
          <h2 className="text-center mb-4">Join Game</h2>
          <input 
            type="text" 
            placeholder="Game Code" 
            value={gameCode}
            onChange={(e) => setGameCode(e.target.value)}
            style={{ textTransform: 'uppercase' }}
          />
          <input 
            type="text" 
            placeholder="Your Name" 
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <select value={house} onChange={(e) => setHouse(e.target.value)}>
            <option value="">Select House...</option>
            <option value="PRUDHVI">🌍 PRUDHVI (Earth)</option>
            <option value="AGNI">🔥 AGNI (Fire)</option>
            <option value="JAL">💧 JAL (Water)</option>
            <option value="VAYU">🌬️ VAYU (Wind)</option>
            <option value="AKASH">✨ AKASH (Sky)</option>
          </select>
          <button className="w-full mt-4" onClick={handleJoin}>Join</button>
          {error && <div className="mt-4 text-center text-error" style={{ color: 'var(--error)' }}>{error}</div>}
        </div>
      </div>
    );
  }

  return (
    <div className="animate-pop-in">
      <div className="glass-panel flex justify-between items-center mb-4" style={{ padding: '1rem 1.5rem' }}>
        <div>
          <span className={`house-badge house-${playerData?.house}`}>{playerData?.house}</span>
          <div className="mt-2">
            <strong>{playerData?.name}</strong> <span className="text-secondary">({playerData?.gameCode})</span>
          </div>
        </div>
        <button className="btn-outline" onClick={() => window.location.reload()}>Leave</button>
      </div>

      <div className="glass-panel text-center mb-4" style={{ padding: '1rem', background: roundStatus === 'open' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(30, 30, 35, 0.5)' }}>
        {roundStatus === 'open' ? (
          <span className="text-success font-bold" style={{ color: 'var(--success)', fontSize: '1.2rem' }}>BUZZER OPEN</span>
        ) : (
          <span className="text-secondary">Waiting for round to start...</span>
        )}
      </div>

      <div className="flex justify-center mb-4" style={{ padding: '2rem 0' }}>
        <button 
          onClick={handleBuzz}
          disabled={roundStatus !== 'open' || queuePos !== null}
          style={{ 
            width: '250px', 
            height: '250px', 
            borderRadius: '50%', 
            fontSize: '2rem',
            background: roundStatus === 'open' && queuePos === null ? `var(--house-${playerData?.house.toLowerCase()})` : '#3f3f46',
            boxShadow: roundStatus === 'open' && queuePos === null ? `0 0 40px var(--house-${playerData?.house.toLowerCase()})` : 'none',
            transition: 'all 0.1s ease',
            transform: queuePos ? 'scale(0.95)' : 'scale(1)',
          }}
          className={roundStatus === 'open' && queuePos === null ? 'animate-pulse' : ''}
        >
          {queuePos ? `POS ${queuePos}` : 'BUZZ'}
        </button>
      </div>

      <div className="glass-panel">
        <h3 className="text-center mb-4" style={{ padding: '1rem 0 0 0' }}>🏆 Live Scores</h3>
        <div className="flex-col gap-2" style={{ padding: '0 1rem 1rem 1rem' }}>
          {Object.entries(scores).sort((a,b) => b[1] - a[1]).map(([h, score]) => (
            <div key={h} className="flex justify-between items-center glass-card" style={{ padding: '0.75rem' }}>
              <span className={`house-badge house-${h}`}>{h}</span>
              <span className="font-bold" style={{ fontSize: '1.2rem' }}>{score}</span>
            </div>
          ))}
          {Object.keys(scores).length === 0 && <div className="text-center text-secondary">No scores yet</div>}
        </div>
      </div>
    </div>
  );
};

export default StudentView;
