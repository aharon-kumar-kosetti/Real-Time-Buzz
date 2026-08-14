// Host Dashboard Logic
let currentGame = null;
let currentRound = null;
let currentAnsweringPlayer = null;

// DOM Elements
const els = {
  loginSection: document.getElementById('login-section'),
  dashboardSection: document.getElementById('dashboard-section'),
  gameControls: document.getElementById('game-controls'),
  roundCreation: document.getElementById('round-creation'),
  roundControls: document.getElementById('round-controls'),
  judgeControls: document.getElementById('judge-controls'),
  
  // Displays
  gameCode: document.getElementById('game-code-display'),
  gameStatus: document.getElementById('game-status-display'),
  currentRound: document.getElementById('current-round-display'),
  currentPresenting: document.getElementById('current-presenting-display'),
  queueList: document.getElementById('queue-list'),
  scoresList: document.getElementById('scores-list'),
  answeringName: document.getElementById('answering-player-name'),
  
  // Buttons
  btnLogin: document.getElementById('login-btn'),
  btnLogout: document.getElementById('logout-btn'),
  btnCreateGame: document.getElementById('create-game-btn'),
  btnStartGame: document.getElementById('start-game-btn'),
  btnEndGame: document.getElementById('end-game-btn'),
  btnCreateRound: document.getElementById('create-round-btn'),
  btnOpenBuzzer: document.getElementById('open-buzzer-btn'),
  btnCloseBuzzer: document.getElementById('close-buzzer-btn'),
  
  // Judge Buttons
  btnCorrect: document.getElementById('mark-correct-btn'),
  btnWrong: document.getElementById('mark-wrong-btn'),
  btnTimeout: document.getElementById('mark-timeout-btn'),
};

// Initialize
async function init() {
  if (api.token) {
    try {
      await api.getMe();
      showDashboard();
    } catch (e) {
      api.logout();
      showLogin();
    }
  } else {
    showLogin();
  }
}

function showLogin() {
  els.loginSection.classList.remove('hidden');
  els.dashboardSection.classList.add('hidden');
}

function showDashboard() {
  els.loginSection.classList.add('hidden');
  els.dashboardSection.classList.remove('hidden');
}

// Authentication
els.btnLogin.addEventListener('click', async () => {
  const email = document.getElementById('email').value;
  const pass = document.getElementById('password').value;
  try {
    await api.login(email, pass);
    showDashboard();
  } catch (e) {
    document.getElementById('login-error').innerText = e.message;
  }
});

els.btnLogout.addEventListener('click', () => {
  api.logout();
  socketService.disconnect();
  showLogin();
});

// Game Management
els.btnCreateGame.addEventListener('click', async () => {
  try {
    const res = await api.createGame();
    currentGame = res.data.game;
    updateGameUI();
    
    // Connect socket
    socketService.connect(currentGame.game_id, null, 'host');
    setupSocketListeners();
  } catch (e) {
    alert(e.message);
  }
});

els.btnStartGame.addEventListener('click', async () => {
  try {
    const res = await api.startGame(currentGame.game_id);
    currentGame = res.data.game;
    updateGameUI();
  } catch (e) {
    alert(e.message);
  }
});

function updateGameUI() {
  if (!currentGame) return;
  els.gameControls.classList.remove('hidden');
  els.gameCode.innerText = currentGame.game_code;
  els.gameStatus.innerText = currentGame.status;
  
  if (currentGame.status === 'LOBBY') {
    els.btnStartGame.classList.remove('hidden');
    els.roundCreation.classList.add('hidden');
  } else if (currentGame.status === 'ACTIVE') {
    els.btnStartGame.classList.add('hidden');
    els.roundCreation.classList.remove('hidden');
  }
}

// Round Management
els.btnCreateRound.addEventListener('click', async () => {
  const roundNum = document.getElementById('round-number').value;
  const house = document.getElementById('presenting-house').value;
  if (!roundNum || !house) return alert("Fill round details");
  
  try {
    const res = await api.createRound(currentGame.game_id, roundNum, house);
    currentRound = res.data.round;
    els.roundControls.classList.remove('hidden');
    els.currentRound.innerText = currentRound.round_number;
    els.currentPresenting.innerText = currentRound.presenting_house;
    els.currentPresenting.className = `house-badge house-${currentRound.presenting_house.toLowerCase()}`;
    
    // Reset UI
    els.queueList.innerHTML = '<p class="text-secondary">No one in queue</p>';
    els.judgeControls.classList.add('hidden');
    els.btnOpenBuzzer.disabled = false;
    els.btnCloseBuzzer.disabled = true;
  } catch (e) {
    alert(e.message);
  }
});

els.btnOpenBuzzer.addEventListener('click', async () => {
  try {
    await api.openBuzzer(currentGame.game_id, currentRound.round_id);
    els.btnOpenBuzzer.disabled = true;
    els.btnCloseBuzzer.disabled = false;
  } catch (e) {
    alert(e.message);
  }
});

els.btnCloseBuzzer.addEventListener('click', async () => {
  try {
    await api.closeBuzzer(currentGame.game_id, currentRound.round_id);
    els.btnCloseBuzzer.disabled = true;
  } catch (e) {
    alert(e.message);
  }
});

// Judge Controls
async function markAnswer(result) {
  if (!currentAnsweringPlayer) return;
  try {
    await api.markAnswer(currentGame.game_id, currentRound.round_id, currentAnsweringPlayer.player_id, result);
    // UI will update via socket events
  } catch (e) {
    alert(e.message);
  }
}
els.btnCorrect.addEventListener('click', () => markAnswer('CORRECT'));
els.btnWrong.addEventListener('click', () => markAnswer('WRONG'));
els.btnTimeout.addEventListener('click', () => markAnswer('TIMEOUT'));


// Socket Listeners
let queue = [];
function setupSocketListeners() {
  socketService.on('round:status-change', (data) => {
    if (data.status === 'BUZZER_LOCKED') {
      els.btnOpenBuzzer.disabled = true;
      els.btnCloseBuzzer.disabled = true;
    }
  });

  socketService.on('buzz:queue-update', (data) => {
    queue.push(data);
    queue.sort((a, b) => a.queuePosition - b.queuePosition);
    renderQueue();
    
    if (data.isAnswering) {
      setAnsweringPlayer(data);
    }
  });

  socketService.on('answer:result', (data) => {
    // Remove the player who just answered from local active queue visualization
    const answeredIdx = queue.findIndex(q => q.playerId === data.playerId);
    if (answeredIdx > -1) {
      queue[answeredIdx].status = data.result;
    }
    
    if (data.nextPlayer) {
      setAnsweringPlayer(data.nextPlayer);
    } else {
      els.judgeControls.classList.add('hidden');
      if (data.roundStatus === 'COMPLETED') {
        alert('Round Completed!');
        els.roundControls.classList.add('hidden');
        queue = [];
      }
    }
    renderQueue();
  });

  socketService.on('game:scores-update', (scores) => {
    scores.sort((a, b) => b.total_points - a.total_points);
    els.scoresList.innerHTML = scores.map((s, i) => `
      <div class="score-row">
        <span><strong>${i+1}.</strong> <span class="house-badge house-${s.house.toLowerCase()}">${s.house}</span></span>
        <strong>${s.total_points}</strong>
      </div>
    `).join('');
  });
}

function renderQueue() {
  if (queue.length === 0) {
    els.queueList.innerHTML = '<p class="text-secondary">No one in queue</p>';
    return;
  }
  
  els.queueList.innerHTML = queue.map(q => `
    <div class="queue-item ${q.isAnswering || (currentAnsweringPlayer && currentAnsweringPlayer.playerId === q.playerId) ? 'answering' : ''}">
      <span><strong>#${q.queuePosition}</strong> - ${q.playerName}</span>
      <span class="house-badge house-${q.house.toLowerCase()}">${q.house}</span>
      <span>${q.status || 'WAITING'}</span>
    </div>
  `).join('');
}

function setAnsweringPlayer(player) {
  currentAnsweringPlayer = player;
  els.judgeControls.classList.remove('hidden');
  els.answeringName.innerText = `${player.playerName} (${player.house})`;
}

init();
