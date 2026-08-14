import React from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Monitor, Gamepad2 } from 'lucide-react';

const LandingPage = () => {
  const navigate = useNavigate();

  return (
    <div className="flex-col items-center justify-center animate-pop-in" style={{ minHeight: '80vh' }}>
      <div className="text-center mb-4">
        <h1 className="text-gradient" style={{ fontSize: '4rem', marginBottom: '0.5rem' }}>HOUSE BUZZ</h1>
        <p className="text-secondary" style={{ fontSize: '1.2rem' }}>The Ultimate Quiz Buzzer System</p>
      </div>
      
      <div className="glass-panel" style={{ padding: '2rem', maxWidth: '600px', width: '100%', marginTop: '2rem' }}>
        <h2 className="text-center mb-4" style={{ fontSize: '1.5rem', fontWeight: 600 }}>Select Your Role</h2>
        
        <div className="flex-col gap-4">
          <button 
            className="btn-outline flex items-center justify-between" 
            style={{ padding: '1.5rem', fontSize: '1.2rem' }}
            onClick={() => navigate('/student')}
          >
            <div className="flex items-center gap-4">
              <Gamepad2 size={28} className="text-accent-primary" />
              <span>Join as Player</span>
            </div>
            <span className="text-secondary text-sm">Play the game</span>
          </button>
          
          <button 
            className="btn-outline flex items-center justify-between" 
            style={{ padding: '1.5rem', fontSize: '1.2rem' }}
            onClick={() => navigate('/display')}
          >
            <div className="flex items-center gap-4">
              <Monitor size={28} className="text-accent-primary" />
              <span>Audience Display</span>
            </div>
            <span className="text-secondary text-sm">Show on big screen</span>
          </button>

          <button 
            className="btn-outline flex items-center justify-between" 
            style={{ padding: '1.5rem', fontSize: '1.2rem' }}
            onClick={() => navigate('/host')}
          >
            <div className="flex items-center gap-4">
              <User size={28} className="text-accent-primary" />
              <span>Host Dashboard</span>
            </div>
            <span className="text-secondary text-sm">Control the game</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default LandingPage;
