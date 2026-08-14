import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import HostDashboard from './pages/HostDashboard';
import StudentView from './pages/StudentView';
import AudienceDisplay from './pages/AudienceDisplay';

function App() {
  return (
    <Router>
      <div className="app-container">
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/host" element={<HostDashboard />} />
          <Route path="/student" element={<StudentView />} />
          <Route path="/display" element={<AudienceDisplay />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
