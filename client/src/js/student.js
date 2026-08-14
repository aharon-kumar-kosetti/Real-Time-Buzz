let player = null;
let currentGameId = null;
let currentRoundId = null;
let hasBuzzed = false;
let presentingHouse = null;
let heartbeatInterval = null;

// DOM
const els = {
  joinSection: document.getElementById('join-section'),
  playSection: document.getElementById('play-section'),
  
  // Join Form
  gameCode: document.getElementById('game-code'),
  playerName: document.getElementById('player-name'),
  playerHouse: document.getElementById('player-house'),
  btnJoin: document.getElementById('join-btn'),
  joinError: document.getElementById('join-error'),
  
  // Play Area
  houseBadge: document.getElementById('player-house-badge'),
  displayName: document.getElementById('display-name'),
  displayCode: document.getElementById('display-code'),
  btnLeave: document.getElementById('leave-btn'),
  statusBanner: document.getElementById('status-banner'),
  btnBuzz: document.getElementById('buzz-btn'),
  queuePosition: document.getElementById('queue-position'),
  posNumber: document.getElementById('pos-number'),
  scoresList: document.getElementById('scores-list'),
};

// Auto-uppercase game code
els.gameCode.addEventListener('input', (e) => {
  e.target.value = e.target.value.toUpperCase();
});

els.btnJoin.addEventListener('click', async () => {
  const code = els.gameCode.value.trim();
  const name = els.playerName.value.trim();
  const house = els.playerHouse.value;
  
  if (!code || !name || !house) {
    els.joinError.innerText = "Please fill all fields";
    return;
  }
  
  try {
    els.btnJoin.disabled = true;
    els.btnJoin.innerText = "Joining...";
    
    const res = await api.joinGame(code, name, house);
    player = res.data.player;
    currentGameId = player.game_id;
    
    // Connect socket
    socketService.connect(currentGameId, player.player_id, 'student');
    setupSocketListeners();
    
    // Start heartbeat
    heartbeatInterval = setInterval(() => {
      api.sendHeartbeat(player.player_id).catch(e => console.error(e));
    }, 30000);
    
    showPlayArea();
  } catch (e) {
    els.joinError.innerText = e.message;
  } finally {
    els.btnJoin.disabled = false;
    els.btnJoin.innerText = "JOIN GAME";
  }
});

els.btnLeave.addEventListener('click', () => {
  api.logout();
  socketService.disconnect();
  clearInterval(heartbeatInterval);
  window.location.reload();
});

function showPlayArea() {
  els.joinSection.classList.add('hidden');
  els.playSection.classList.remove('hidden');
  
  els.houseBadge.innerText = player.house;
  els.houseBadge.className = `house-badge house-${player.house.toLowerCase()}`;
  els.displayName.innerText = player.name;
  els.displayCode.innerText = player.player_code;
}

els.btnBuzz.addEventListener('click', async () => {
  if (hasBuzzed || els.btnBuzz.disabled) return;
  
  try {
    // Optimistically disable
    els.btnBuzz.disabled = true;
    els.btnBuzz.classList.remove('active');
    
    const res = await api.buzz(currentGameId, currentRoundId);
    hasBuzzed = true;
    
    els.queuePosition.classList.remove('hidden');
    els.posNumber.innerText = `#${res.data.queuePosition}`;
    els.statusBanner.innerText = "Buzz registered!";
  } catch (e) {
    alert(e.message);
    if (!hasBuzzed) {
      els.btnBuzz.disabled = false;
      els.btnBuzz.classList.add('active');
    }
  }
});

function setupSocketListeners() {
  socketService.on('round:status-change', (data) => {
    currentRoundId = data.roundId;
    
    if (data.status === 'BUZZER_OPEN') {
      hasBuzzed = false;
      els.queuePosition.classList.add('hidden');
      
      // The server doesn't send presenting house in this broadcast yet,
      // but we will just rely on the server rejecting invalid buzzes if they are presenting.
      // Ideally, the student shouldn't even be able to click it.
      
      els.statusBanner.innerText = "BUZZER IS OPEN!";
      els.statusBanner.style.backgroundColor = "var(--surface)";
      els.statusBanner.style.color = "var(--accent)";
      
      els.btnBuzz.disabled = false;
      els.btnBuzz.classList.add('active');
      
      // Haptic feedback for mobile
      if (window.navigator && window.navigator.vibrate) {
        window.navigator.vibrate(200);
      }
      
    } else if (data.status === 'BUZZER_LOCKED') {
      els.statusBanner.innerText = "Buzzer Locked";
      els.statusBanner.style.backgroundColor = "var(--border)";
      els.statusBanner.style.color = "var(--text-primary)";
      
      els.btnBuzz.disabled = true;
      els.btnBuzz.classList.remove('active');
    }
  });

  socketService.on('answer:result', (data) => {
    if (data.roundStatus === 'COMPLETED') {
      els.statusBanner.innerText = "Round Completed!";
      els.btnBuzz.disabled = true;
      els.btnBuzz.classList.remove('active');
      hasBuzzed = false;
    } else if (data.nextPlayer) {
      if (data.nextPlayer.playerId === player.player_id) {
        els.statusBanner.innerText = "YOU ARE ANSWERING!";
      } else {
        els.statusBanner.innerText = `${data.nextPlayer.playerName} (${data.nextPlayer.house}) is answering`;
      }
    }
  });

  socketService.on('game:scores-update', (scores) => {
    scores.sort((a, b) => b.total_points - a.total_points);
    els.scoresList.innerHTML = scores.map((s, i) => `
      <div style="display:flex; justify-content:space-between; padding:0.5rem 0; border-bottom:1px solid var(--border)">
        <span><strong>${i+1}.</strong> <span class="house-badge house-${s.house.toLowerCase()}">${s.house}</span></span>
        <strong>${s.total_points}</strong>
      </div>
    `).join('');
  });
}
