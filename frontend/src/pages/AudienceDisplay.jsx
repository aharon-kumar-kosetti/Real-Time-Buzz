import React, { useState, useEffect, useRef } from 'react';
import { useSocket } from '../context/SocketContext';
import { apiService } from '../services/api';

const AudienceDisplay = () => {
  const { connect, disconnect, on, off } = useSocket();
  const [setupMode, setSetupMode] = useState(true);
  const [gameCode, setGameCode] = useState('');
  const [error, setError] = useState('');

  const [gameStatus, setGameStatus] = useState(null);
  const [queue, setQueue] = useState([]);
  const [countdown, setCountdown] = useState(null);
  
  const [firstBuzzPulse, setFirstBuzzPulse] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    return () => {
      disconnect();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  useEffect(() => {
    const handleQueueUpdate = async (data) => {
      if (Array.isArray(data?.queue)) {
        setQueue(data.queue);
      } else if (data && data.roundId && gameStatus?.id) {
        try {
          const qData = await apiService.getQueue(gameStatus.id, data.roundId);
          setQueue(qData);
        } catch (e) {
          console.error(e);
        }
      }
      setFirstBuzzPulse(false);
      setTimeout(() => setFirstBuzzPulse(true), 10);
    };

    const handleStatusChange = async (data) => {
      if (gameStatus) {
        const status = await apiService.getGameStatus(gameStatus.id);
        setGameStatus(status);
        if (status.currentRound) {
          try {
            const qData = await apiService.getQueue(gameStatus.id, status.currentRound.id);
            setQueue(qData);
          } catch (e) {
            console.error(e);
          }
        }
      }

      if (data?.status === 'BUZZER_OPEN' && data?.duration) {
        setCountdown(data.duration);
        if (timerRef.current) clearInterval(timerRef.current);
        timerRef.current = setInterval(() => {
          setCountdown(prev => {
            if (prev === null || prev <= 1) {
              clearInterval(timerRef.current);
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
      } else if (data?.status === 'BUZZER_LOCKED' || data?.status === 'COMPLETED') {
        setCountdown(null);
        if (timerRef.current) clearInterval(timerRef.current);
      }
    };

    on('buzz:queue-update', handleQueueUpdate);
    on('round:status-change', handleStatusChange);

    return () => {
      off('buzz:queue-update', handleQueueUpdate);
      off('round:status-change', handleStatusChange);
    };
  }, [gameStatus, on, off]);

  const handleConnect = async (e) => {
    if (e) e.preventDefault();
    try {
      setError('');
      if (!gameCode.trim()) {
        setError('Please enter a Game Code');
        return;
      }

      const data = await apiService.joinGame(gameCode.trim().toUpperCase(), 'Audience Display');
      
      const status = await apiService.getGameStatus(data.player.gameId);
      setGameStatus(status);
      
      if (status.currentRound) {
        try {
          const qData = await apiService.getQueue(data.player.gameId, status.currentRound.id);
          setQueue(qData);
        } catch (err) {
          console.error(err);
        }
      }

      connect(data.player.gameId, data.player.id, 'display');
      setSetupMode(false);
    } catch (err) {
      setError(err.message || 'Failed to connect. Make sure the code is correct.');
    }
  };

  if (setupMode) {
    return (
      <div className="flex-col items-center justify-center animate-slide-up" style={{ minHeight: '80vh' }}>
        <form className="glass-panel text-center" style={{ padding: '3rem', maxWidth: '500px', width: '100%' }} onSubmit={handleConnect}>
          <h2 className="mb-4">Configure Audience Display</h2>
          <input 
            type="text" 
            placeholder="House Join Code" 
            value={gameCode}
            onChange={e => setGameCode(e.target.value.toUpperCase())}
            style={{ fontSize: '2rem', textAlign: 'center', textTransform: 'uppercase' }}
          />
          <button type="submit" className="w-full mt-4" style={{ fontSize: '1.5rem', padding: '1rem' }}>Connect Display</button>
          {error && <div className="mt-4 text-error">{error}</div>}
        </form>
      </div>
    );
  }

  const firstInQueue = queue.length > 0 ? queue[0] : null;
  const isBuzzerOpen = gameStatus?.currentRound?.status === 'BUZZER_OPEN';
  const presentingHouse = gameStatus?.currentRound?.presentingHouse;

  return (
    <div className="animate-pop-in flex-col" style={{ height: '100vh', padding: '0', overflow: 'hidden' }}>
      
      {/* Header */}
      <div className="glass-panel" style={{ borderRadius: 0, borderTop: 'none', borderLeft: 'none', borderRight: 'none', padding: '1rem 2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="flex gap-4 items-center">
          <h1 style={{ margin: 0, fontSize: '2rem' }}>HOUSE BUZZ</h1>
          <span style={{letterSpacing: '0.15em', background:'rgba(255,255,255,0.1)', padding:'0.25rem 0.75rem', borderRadius:'6px', fontWeight: 'bold', fontSize: '1.2rem'}}>CODE: {gameCode}</span>
        </div>

        {countdown !== null && (
          <div className="animate-pulse" style={{ fontSize: '1.8rem', fontWeight: 900, color: 'var(--warning)', background: 'rgba(234, 179, 8, 0.18)', padding: '0.3rem 1.2rem', borderRadius: '8px' }}>
            ⏱️ {countdown}s
          </div>
        )}

        <div className="flex gap-4 items-center">
          <span className="text-secondary" style={{fontSize: '1.1rem'}}>ROUND #{gameStatus?.currentRound?.roundNumber || '-'}</span>
          {presentingHouse === 'ALL' ? (
            <span className="house-badge" style={{ fontSize: '1.1rem', background: 'var(--accent-primary)', color: '#fff' }}>
              🌟 OPEN TO ALL
            </span>
          ) : (
            <span className={`house-badge ${presentingHouse ? 'house-' + presentingHouse : ''}`} style={{ fontSize: '1.1rem' }}>
              {presentingHouse ? `Presenting: ${presentingHouse}` : 'WAITING...'}
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-1" style={{ padding: '2rem', gap: '2rem', height: 'calc(100vh - 85px)' }}>
        
        {/* Center Main Stage */}
        <div className="glass-panel flex-1 flex-col items-center justify-center relative" style={{ overflow: 'hidden' }}>
          {firstInQueue ? (
            <div className={`text-center ${firstBuzzPulse ? 'animate-pop-in' : ''}`} style={{ zIndex: 10 }}>
              <div className="text-warning mb-4" style={{ fontSize: '2.5rem', fontWeight: 900 }}>🏆 FIRST BUZZ! 🏆</div>
              <div className={`house-badge house-${firstInQueue.house} mb-4`} style={{ fontSize: '3rem', padding: '1rem 3rem' }}>
                {firstInQueue.house}
              </div>
              <div style={{ fontSize: '4.5rem', fontWeight: 900, letterSpacing: '0.02em' }}>{firstInQueue.playerName}</div>
              <div className="text-accent-primary mt-4 animate-pulse" style={{ fontSize: '2.2rem', fontWeight: 800 }}>ANSWERING NOW...</div>
            </div>
          ) : (
             <div className="text-center" style={{ zIndex: 10 }}>
               {isBuzzerOpen ? (
                 <div className="text-success animate-pulse font-bold" style={{ fontSize: '3.2rem', color: 'var(--success)' }}>
                   ⚡ BUZZERS OPEN! ⚡
                 </div>
               ) : (
                 <div className="text-secondary" style={{ fontSize: '2.2rem' }}>
                   Waiting for host to open buzzers...
                 </div>
               )}
             </div>
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
                 opacity: 0.2,
                 zIndex: 0
               }}
             />
          )}
        </div>

        {/* Right Sidebar - Buzzer Queue (Unlimited) */}
        <div className="flex-col gap-4" style={{ width: '450px' }}>
          <div className="glass-panel flex-1" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', height: '100%' }}>
            <h3 className="mb-4 text-center">Buzzer Queue ({queue.length})</h3>
            <div className="flex-col gap-3" style={{ flex: 1, overflowY: 'auto', maxHeight: '72vh', paddingRight: '0.25rem' }}>
              {queue.length === 0 ? (
                <div className="text-secondary text-center py-6" style={{ fontSize: '1.2rem' }}>
                  No one in queue yet
                </div>
              ) : (
                queue.map((qItem, idx) => (
                  <div 
                    key={qItem.playerId || idx} 
                    className="glass-card flex items-center justify-between" 
                    style={{ 
                      padding: '0.9rem 1.3rem',
                      borderLeft: idx === 0 ? '5px solid var(--accent-primary)' : '3px solid rgba(255,255,255,0.15)',
                      background: idx === 0 ? 'rgba(99, 102, 241, 0.18)' : 'rgba(255,255,255,0.03)'
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-secondary" style={{ fontSize: '1.5rem', fontWeight: 900, color: idx === 0 ? 'var(--accent-primary)' : 'inherit' }}>
                        #{idx + 1}
                      </span>
                      <div>
                        <div style={{ fontSize: '1.3rem', fontWeight: 700 }}>{qItem.playerName}</div>
                        {idx === 0 && <span style={{ fontSize: '0.8rem', color: 'var(--success)', fontWeight: 800 }}>FIRST BUZZ</span>}
                      </div>
                    </div>
                    <div className={`house-badge house-${qItem.house}`} style={{ fontSize: '0.9rem' }}>
                      {qItem.house}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

export default AudienceDisplay;
