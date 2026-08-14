let currentGameId = null;
let queue = [];
let currentAnsweringPlayerId = null;

const els = {
  setupSection: document.getElementById('setup-section'),
  displaySection: document.getElementById('display-section'),
  gameCodeInput: document.getElementById('game-code'),
  btnConnect: document.getElementById('connect-btn'),
  errorMsg: document.getElementById('error-msg'),
  
  // Header
  roundNumber: document.getElementById('round-number'),
  presentingHouse: document.getElementById('presenting-house'),
  
  // First Buzz Hero
  hero: document.getElementById('first-buzz-hero'),
  heroHouse: document.getElementById('first-buzz-house'),
  heroName: document.getElementById('first-buzz-name'),
  heroStatus: document.getElementById('first-buzz-status'),
  
  // Scores
  scoresContainer: document.getElementById('scores-container'),
};

els.gameCodeInput.addEventListener('input', (e) => {
  e.target.value = e.target.value.toUpperCase();
});

els.btnConnect.addEventListener('click', async () => {
  const code = els.gameCodeInput.value.trim();
  if (!code) return;
  
  try {
    els.btnConnect.disabled = true;
    
    // We don't have a direct "join as display" endpoint, but we can hit /players/join as a dummy 
    // OR we can just use the host token if the display is logged in. 
    // Since this is a public screen, we can just use the socket connection if we know the gameId.
    // Wait, we need gameId to connect to the socket room. Let's add a quick fetch to get gameId from gameCode.
    // Since we don't have a public endpoint to get gameId by code, let's use the host token for the display,
    // or just let the host log into the display.
    // For simplicity without modifying backend: we can use a dummy player to join and get gameId.
    
    const dummyName = "Display_" + Math.random().toString(36).substr(2, 5);
    const res = await api.joinGame(code, dummyName, "PRUDHVI");
    
    currentGameId = res.data.player.game_id;
    
    socketService.connect(currentGameId, null, 'display');
    setupSocketListeners();
    
    // Initial fetch for status could happen here, but we will rely on socket broadcasts
    
    els.setupSection.classList.add('hidden');
    els.displaySection.classList.remove('hidden');
    
  } catch (e) {
    els.errorMsg.innerText = "Error: Invalid game code or connection failed.";
    els.btnConnect.disabled = false;
  }
});

function setupSocketListeners() {
  
  socketService.on('round:status-change', (data) => {
    // We don't have all round info in the payload (like presenting house),
    // A robust system would fetch round details here. 
    // For now, we just clear the queue when buzzer opens.
    if (data.status === 'BUZZER_OPEN') {
      queue = [];
      currentAnsweringPlayerId = null;
      hideHero();
      renderQueue();
      els.roundNumber.innerText = "?"; // Could fetch from api
      els.presentingHouse.innerText = "WAITING FOR BUZZ...";
      els.presentingHouse.className = "house-badge";
    }
  });

  socketService.on('buzz:queue-update', (data) => {
    queue.push(data);
    queue.sort((a, b) => a.queuePosition - b.queuePosition);
    
    if (data.isAnswering) {
      currentAnsweringPlayerId = data.playerId;
      showHero(data);
    }
    
    renderQueue();
  });

  socketService.on('answer:result', (data) => {
    const answeredIdx = queue.findIndex(q => q.playerId === data.playerId);
    if (answeredIdx > -1) {
      queue[answeredIdx].status = data.result;
    }
    
    if (data.nextPlayer) {
      currentAnsweringPlayerId = data.nextPlayer.playerId;
      showHero({
        house: data.nextPlayer.house,
        playerName: data.nextPlayer.playerName,
      }, true);
    } else {
      currentAnsweringPlayerId = null;
      if (data.roundStatus === 'COMPLETED') {
        els.heroStatus.innerText = "ROUND COMPLETED!";
        els.heroStatus.style.color = "var(--text-primary)";
      }
    }
    renderQueue();
  });

  socketService.on('game:scores-update', (scores) => {
    scores.sort((a, b) => b.total_points - a.total_points);
    els.scoresContainer.innerHTML = scores.map(s => `
      <div class="score-box">
        <div class="score-house house-${s.house.toLowerCase()}" style="color:var(--color-${s.house.toLowerCase()})">${s.house}</div>
        <div class="score-points">${s.total_points}</div>
      </div>
    `).join('');
  });
}

function showHero(data, isNextPlayer = false) {
  els.hero.classList.add('visible');
  els.hero.style.backgroundColor = `var(--color-${data.house.toLowerCase()})`;
  els.heroHouse.innerText = data.house;
  els.heroName.innerText = data.playerName;
  
  if (isNextPlayer) {
    els.hero.querySelector('.first-buzz-title').innerText = "NEXT UP";
  } else {
    els.hero.querySelector('.first-buzz-title').innerText = "🏆 FIRST BUZZ! 🏆";
  }
  
  els.heroStatus.innerText = "ANSWERING NOW...";
  els.heroStatus.style.color = "#fff";
}

function hideHero() {
  els.hero.classList.remove('visible');
}

function renderQueue() {
  for (let i = 1; i <= 4; i++) {
    const slot = document.getElementById(`queue-slot-${i}`);
    const qData = queue.find(q => q.queuePosition === i);
    
    if (qData) {
      slot.classList.add('filled');
      if (qData.playerId === currentAnsweringPlayerId) {
        slot.classList.add('answering');
      } else {
        slot.classList.remove('answering');
      }
      
      let statusHtml = '';
      if (qData.status === 'CORRECT') statusHtml = '<span style="color:var(--accent)">✓ CORRECT</span>';
      else if (qData.status === 'WRONG') statusHtml = '<span style="color:var(--error)">✗ WRONG</span>';
      else if (qData.status === 'TIMEOUT') statusHtml = '<span style="color:var(--text-secondary)">⏱️ TIMEOUT</span>';
      
      slot.innerHTML = `
        <div style="font-size:1rem; opacity:0.8;">${i === 1 ? '1ST' : i === 2 ? '2ND' : i === 3 ? '3RD' : '4TH'}</div>
        <div class="mt-4" style="font-weight:bold">${qData.playerName}</div>
        <div class="house-badge house-${qData.house.toLowerCase()} mt-2">${qData.house}</div>
        <div class="mt-2" style="font-size:1rem">${statusHtml}</div>
      `;
    } else {
      slot.classList.remove('filled', 'answering');
      slot.innerHTML = `
        <div>${i === 1 ? '1ST' : i === 2 ? '2ND' : i === 3 ? '3RD' : '4TH'}</div>
        <div class="slot-content text-secondary mt-4">Waiting...</div>
      `;
    }
  }
}
