import axios from 'axios';

const API_URL = '/api';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

class ApiService {
  setToken(token) {
    localStorage.setItem('token', token);
  }

  logout() {
    localStorage.removeItem('token');
  }

  async handleRequest(requestPromise) {
    try {
      const response = await requestPromise;
      return response.data.data || response.data; // unwrap 'data' payload
    } catch (error) {
      if (error.response && error.response.status === 401) {
        this.logout();
        window.location.reload();
      }
      if (error.response && error.response.data && error.response.data.message) {
        throw new Error(error.response.data.message);
      }
      throw new Error('An unexpected error occurred');
    }
  }

  mapGame(g) {
    if (!g) return null;
    return {
      ...g,
      id: g.game_id,
      code: g.game_code,
      currentRound: g.currentRound ? {
        ...g.currentRound,
        id: g.currentRound.round_id,
        roundNumber: g.currentRound.round_number,
        presentingHouse: g.currentRound.presenting_house
      } : null
    };
  }

  // Auth
  login(email, password) {
    return this.handleRequest(api.post('/auth/login', { email, password })).then((data) => {
      this.setToken(data.token);
      return data;
    });
  }

  getMe() {
    return this.handleRequest(api.get('/auth/me'));
  }

  // Games (Host)
  createGame() {
    return this.handleRequest(api.post('/games/create')).then(data => this.mapGame(data.game));
  }

  startGame(gameId) {
    return this.handleRequest(api.post(`/games/${gameId}/start`)).then(data => this.mapGame(data.game));
  }

  endGame(gameId) {
    return this.handleRequest(api.post(`/games/${gameId}/end`)).then(data => this.mapGame(data.game));
  }

  getGameStatus(gameId) {
    return this.handleRequest(api.get(`/games/${gameId}/status`)).then(data => this.mapGame(data.game));
  }

  getConnectedPlayers(gameId) {
    return this.handleRequest(api.get(`/games/${gameId}/players`)).then(data => {
      return data.players.map(p => ({
        ...p,
        id: p.player_id,
        playerId: p.player_id,
      }));
    });
  }

  // Rounds (Host)
  createRound(gameId, roundNumber, presentingHouse) {
    return this.handleRequest(api.post(`/games/${gameId}/rounds/create`, { roundNumber, presentingHouse }));
  }

  openBuzzer(gameId, roundId) {
    return this.handleRequest(api.post(`/games/${gameId}/rounds/${roundId}/open-buzzer`));
  }

  closeBuzzer(gameId, roundId) {
    return this.handleRequest(api.post(`/games/${gameId}/rounds/${roundId}/close-buzzer`));
  }

  getQueue(gameId, roundId) {
    return this.handleRequest(api.get(`/games/${gameId}/rounds/${roundId}/queue`)).then(data => {
      return data.queue.map(q => ({
        ...q,
        playerId: q.player_id,
        playerName: q.player_name
      }));
    });
  }

  markAnswer(gameId, roundId, playerId, result) {
    return this.handleRequest(api.post(`/games/${gameId}/rounds/${roundId}/mark-answer`, { playerId, result }));
  }

  // Data Retrieval
  getScores(gameId) {
    return this.handleRequest(api.get(`/games/${gameId}/scores`));
  }

  getStats(gameId) {
    return this.handleRequest(api.get(`/games/${gameId}/stats`));
  }

  // Student (Players)
  joinGame(gameCode, name, house) {
    return this.handleRequest(api.post('/players/join', { gameCode, name, house })).then((data) => {
      this.setToken(data.token);
      return {
        ...data,
        player: {
          ...data.player,
          id: data.player.player_id,
          gameId: data.player.game_id
        }
      };
    });
  }

  buzz(gameId, roundId) {
    return this.handleRequest(api.post(`/games/${gameId}/rounds/${roundId}/buzz`));
  }

  sendHeartbeat(playerId) {
    return this.handleRequest(api.post(`/players/${playerId}/heartbeat`));
  }
}

export const apiService = new ApiService();
