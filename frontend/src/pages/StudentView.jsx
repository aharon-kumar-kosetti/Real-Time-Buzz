import React, { useState, useEffect, useRef } from 'react';
import { useSocket } from '../context/SocketContext';
import { apiService } from '../services/api';

const StudentView = () => {
  const { connect, disconnect, on, off } = useSocket();
  const [gameState, setGameState] = useState('join'); // 'join', 'playing'
  const [error, setError] = useState('');
  
  // Join form state
  const [gameCode, setGameCode] = useState('');
  const [name, setName] = useState('');
  
  // Game state
  const [playerData, setPlayerData] = useState(null);
  const [roundStatus, setRoundStatus] = useState('closed'); // 'open', 'closed'
  const [currentRoundId, setCurrentRoundId] = useState(null);
  const [currentRoundNumber, setCurrentRoundNumber] = useState(null);
  const [presentingHouse, setPresentingHouse] = useState('');
  const [queuePos, setQueuePos] = useState(null);
  const [buzzedSuccess, setBuzzedSuccess] = useState(false);
  const [countdown, setCountdown] = useState(null);

  const countdownIntervalRef = useRef(null);

  // Restore session from localStorage on initial load
  useEffect(() => {
    const saved = localStorage.getItem('student_session');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.player && parsed.player.id && parsed.player.gameId) {
          setPlayerData(parsed.player);
          setGameState('playing');
          connect(parsed.player.gameId, parsed.player.id, 'student');
          
          // Re-sync game status and round
          apiService.getGameStatus(parsed.player.gameId)
            .then((status) => {
              if (status && status.currentRound) {
                setCurrentRoundId(status.currentRound.id);
                setCurrentRoundNumber(status.currentRound.roundNumber);
                setPresentingHouse(status.currentRound.presentingHouse || '');
                const isOpen = status.currentRound.status === 'BUZZER_OPEN';
                setRoundStatus(isOpen ? 'open' : 'closed');
                
                // Check if already in queue
                apiService.getQueue(parsed.player.gameId, status.currentRound.id)
                  .then((qList) => {
                    const myIndex = qList.findIndex(q => (q.playerId || q.player_id) === parsed.player.id);
                    if (myIndex !== -1) {
                      setQueuePos(myIndex + 1);
                      setBuzzedSuccess(true);
                    }
                  })
                  .catch(() => {});
              }
            })
            .catch((err) => {
              console.error('Failed to sync game status:', err);
            });
        }
      } catch (e) {
        console.error('Failed to restore student session:', e);
      }
    }
    
    return () => {
      disconnect();
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    };
  }, []);

  // Periodic heartbeat to keep player live in database
  useEffect(() => {
    if (gameState !== 'playing' || !playerData?.id) return;

    // Send immediate heartbeat on entry
    apiService.sendHeartbeat(playerData.id).catch(console.error);

    // Send heartbeat every 15 seconds
    const interval = setInterval(() => {
      apiService.sendHeartbeat(playerData.id).catch(console.error);
    }, 15000);

    return () => clearInterval(interval);
  }, [gameState, playerData]);

  // Socket event handlers
  useEffect(() => {
    const handleStatusChange = (data) => {
      if (data.status === 'BUZZER_OPEN' || data.status === 'open') {
        setRoundStatus('open');
        setBuzzedSuccess(false);
        setQueuePos(null);
        setError('');
        if (data.roundId) setCurrentRoundId(data.roundId);
        if (data.presentingHouse) setPresentingHouse(data.presentingHouse);

        if (data.duration) {
          setCountdown(data.duration);
          if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
          countdownIntervalRef.current = setInterval(() => {
            setCountdown(prev => {
              if (prev === null || prev <= 1) {
                clearInterval(countdownIntervalRef.current);
                return 0;
              }
              return prev - 1;
            });
          }, 1000);
        }
      } else {
        setRoundStatus('closed');
        setCountdown(null);
        if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
        if (data.status === 'COMPLETED') {
          setQueuePos(null);
          setBuzzedSuccess(false);
        }
      }
    };

    const handleQueueUpdate = (data) => {
      if (!playerData) return;
      if (Array.isArray(data?.queue)) {
        if (data.queue.length === 0) {
          setQueuePos(null);
          setBuzzedSuccess(false);
        } else {
          const myIndex = data.queue.findIndex(item => (item.playerId || item.player_id) === playerData.id);
          if (myIndex !== -1) {
            setQueuePos(myIndex + 1);
            setBuzzedSuccess(true);
          }
        }
      } else if (data && ((data.playerId || data.player_id) === playerData.id)) {
        setQueuePos(data.queuePosition || data.queue_position);
        setBuzzedSuccess(true);
      }
    };

    const handleAnswerResult = (data) => {
      if (data.result === 'CORRECT' || data.roundStatus === 'COMPLETED') {
        setRoundStatus('closed');
        setQueuePos(null);
        setBuzzedSuccess(false);
      }
    };

    on('round:status-change', handleStatusChange);
    on('buzz:queue-update', handleQueueUpdate);
    on('answer:result', handleAnswerResult);

    return () => {
      off('round:status-change', handleStatusChange);
      off('buzz:queue-update', handleQueueUpdate);
      off('answer:result', handleAnswerResult);
    };
  }, [playerData, on, off]);

  const handleJoin = async (e) => {
    if (e) e.preventDefault();
    try {
      setError('');
      if (!gameCode.trim() || !name.trim()) {
        setError('Please enter your house join code and name');
        return;
      }

      const data = await apiService.joinGame(gameCode.trim().toUpperCase(), name.trim());
      setPlayerData(data.player);
      connect(data.player.gameId, data.player.id, 'student');
      
      // Check current game status
      const statusRes = await apiService.getGameStatus(data.player.gameId);
      if (statusRes && statusRes.currentRound) {
        setCurrentRoundId(statusRes.currentRound.id);
        setCurrentRoundNumber(statusRes.currentRound.roundNumber);
        setPresentingHouse(statusRes.currentRound.presentingHouse || '');
        const isOpen = statusRes.currentRound.status === 'BUZZER_OPEN';
        setRoundStatus(isOpen ? 'open' : 'closed');
      }
      
      setGameState('playing');
    } catch (err) {
      setError(err.message || 'Failed to join game');
    }
  };

  const handleBuzz = async () => {
    if (roundStatus !== 'open' || !playerData) return;
    try {
      setError('');
      let targetRoundId = currentRoundId;
      if (!targetRoundId) {
        const statusRes = await apiService.getGameStatus(playerData.gameId);
        if (statusRes.currentRound) {
          targetRoundId = statusRes.currentRound.id;
          setCurrentRoundId(targetRoundId);
          setCurrentRoundNumber(statusRes.currentRound.roundNumber);
        }
      }

      if (!targetRoundId) {
        setError('No active round found to buzz in.');
        return;
      }

      const res = await apiService.buzz(playerData.gameId, targetRoundId);
      setBuzzedSuccess(true);
      if (res?.data?.queuePosition) {
        setQueuePos(res.data.queuePosition);
      }
    } catch (err) {
      console.error('Buzz error:', err);
      setError(err.message || 'Buzz failed');
    }
  };

  const handleLeave = () => {
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    localStorage.removeItem('student_session');
    apiService.logout();
    disconnect();
    setPlayerData(null);
    setGameState('join');
    setGameCode('');
    setName('');
    setQueuePos(null);
    setBuzzedSuccess(false);
    setError('');
  };

  if (gameState === 'join') {
    return (
      <div className="flex-col items-center justify-center animate-slide-up" style={{ minHeight: '80vh' }}>
        <form 
          className="glass-panel" 
          style={{ padding: '2rem', maxWidth: '400px', width: '100%' }}
          onSubmit={handleJoin}
        >
          <h2 className="text-center mb-4">Join Game</h2>
          <input 
            type="text" 
            placeholder="House Join Code" 
            value={gameCode}
            onChange={(e) => setGameCode(e.target.value.toUpperCase())}
            style={{ textTransform: 'uppercase' }}
          />
          <input 
            type="text" 
            placeholder="Your Name" 
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button type="submit" className="w-full mt-4">Join Game</button>
          {error && <div className="mt-4 text-center text-error" style={{ color: 'var(--error)' }}>{error}</div>}
        </form>
      </div>
    );
  }

  const isPresentingOnly = presentingHouse && !['ALL', 'NONE', 'OPEN', ''].includes(presentingHouse.toUpperCase()) && presentingHouse.toUpperCase() === playerData?.house?.toUpperCase();
  const isBuzzed = queuePos !== null || buzzedSuccess;

  return (
    <div className="animate-pop-in">
      <div className="glass-panel flex justify-between items-center mb-4" style={{ padding: '1rem 1.5rem' }}>
        <div>
          <span className={`house-badge house-${playerData?.house}`}>{playerData?.house}</span>
          <div className="mt-2">
            <strong>{playerData?.name}</strong> <span className="text-secondary">({playerData?.player_code || playerData?.playerCode || 'Active'})</span>
            {currentRoundNumber && <span className="ml-2" style={{marginLeft: '0.75rem', color: 'var(--accent-primary)', fontWeight: 600}}>• Round #{currentRoundNumber}</span>}
          </div>
        </div>
        <button className="btn-outline" onClick={handleLeave}>Leave</button>
      </div>

      {/* Banner / Status Indicator */}
      <div 
        className="glass-panel text-center mb-4" 
        style={{ 
          padding: '1.2rem', 
          background: roundStatus === 'open' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(30, 30, 35, 0.5)',
          border: roundStatus === 'open' ? '2px solid var(--success)' : '1px solid rgba(255, 255, 255, 0.1)'
        }}
      >
        {roundStatus === 'open' ? (
          <div>
            <div className="text-success font-bold" style={{ color: 'var(--success)', fontSize: '1.5rem', letterSpacing: '0.05em' }}>
              ⚡ BUZZER OPEN — TAP NOW! ⚡
            </div>
            {countdown !== null && (
              <div className="mt-1 font-bold" style={{ color: 'var(--warning)', fontSize: '1.2rem' }}>
                ⏱️ Time Remaining: {countdown}s
              </div>
            )}
            {isPresentingOnly && (
              <div className="mt-2 text-warning font-bold" style={{ color: '#f59e0b' }}>
                ⚠️ Your house ({playerData?.house}) is presenting this round and cannot buzz.
              </div>
            )}
          </div>
        ) : (
          <div className="text-secondary" style={{ fontSize: '1.15rem' }}>
            🔒 Buzzer is locked. Waiting for host to open...
          </div>
        )}
      </div>

      {error && (
        <div className="glass-panel text-center mb-4 text-error" style={{ padding: '0.75rem', color: 'var(--error)', background: 'rgba(239, 68, 68, 0.1)' }}>
          {error}
        </div>
      )}

      {/* Large Buzzer Button */}
      <div className="flex justify-center mb-4" style={{ padding: '2rem 0' }}>
        <button 
          onClick={handleBuzz}
          disabled={roundStatus !== 'open' || isBuzzed || isPresentingOnly}
          style={{ 
            width: '270px', 
            height: '270px', 
            borderRadius: '50%', 
            fontSize: isBuzzed ? '1.8rem' : '2.8rem',
            fontWeight: 900,
            cursor: roundStatus === 'open' && !isBuzzed && !isPresentingOnly ? 'pointer' : 'not-allowed',
            background: roundStatus === 'open' && !isBuzzed && !isPresentingOnly ? `var(--house-${playerData?.house?.toLowerCase() || 'agni'})` : (isBuzzed ? 'rgba(99, 102, 241, 0.85)' : '#27272a'),
            boxShadow: roundStatus === 'open' && !isBuzzed && !isPresentingOnly ? `0 0 60px var(--house-${playerData?.house?.toLowerCase() || 'agni'})` : 'none',
            transition: 'all 0.12s ease-in-out',
            transform: isBuzzed ? 'scale(0.95)' : (roundStatus === 'open' ? 'scale(1.05)' : 'scale(1)'),
            border: '5px solid rgba(255, 255, 255, 0.25)',
            userSelect: 'none',
            WebkitTapHighlightColor: 'transparent'
          }}
          className={roundStatus === 'open' && !isBuzzed && !isPresentingOnly ? 'animate-pulse' : ''}
        >
          {isBuzzed ? (queuePos ? `POS #${queuePos}` : 'BUZZED!') : 'BUZZ'}
        </button>
      </div>

      {isBuzzed && (
        <div className="glass-panel text-center mb-4" style={{ padding: '1.2rem', background: 'rgba(99, 102, 241, 0.15)', border: '1px solid var(--accent-primary)' }}>
          <span style={{ color: 'var(--accent-primary)', fontWeight: 800, fontSize: '1.3rem' }}>
            {queuePos === 1 ? '🎉 YOU ARE #1! ANSWER THE HOST NOW!' : ` You are in the queue at Position #${queuePos || 1}!`}
          </span>
        </div>
      )}
    </div>
  );
};

export default StudentView;
