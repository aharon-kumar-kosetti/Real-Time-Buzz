import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || '/api';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token && token !== 'undefined' && token !== 'null') {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

class ApiService {
  getToken() {
    const token = localStorage.getItem('token');
    if (!token || token === 'undefined' || token === 'null') {
      return null;
    }
    return token;
  }

  setToken(token) {
    if (token && typeof token === 'string' && token !== 'undefined' && token !== 'null') {
      localStorage.setItem('token', token);
    } else {
      localStorage.removeItem('token');
    }
  }

  logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('student_session');
  }

  isAuthenticated() {
    return !!this.getToken();
  }

  async handleRequest(requestPromise) {
    try {
      const response = await requestPromise;
      return response.data;
    } catch (error) {
      if (error.response && error.response.status === 401) {
        this.logout();
      }
      if (error.response && error.response.data && error.response.data.message) {
        throw new Error(error.response.data.message);
      }
      throw new Error(error.message || 'An unexpected error occurred');
    }
  }

  mapGame(g) {
    if (!g) return null;
    return {
      ...g,
      id: g.game_id || g.id,
      code: g.game_code || g.code,
      houseCodes: g.house_codes || g.houseCodes || {},
      currentRound: g.currentRound ? {
        ...g.currentRound,
        id: g.currentRound.round_id || g.currentRound.id,
        roundNumber: g.currentRound.round_number || g.currentRound.roundNumber,
        presentingHouse: g.currentRound.presenting_house || g.currentRound.presentingHouse,
        status: g.currentRound.status
      } : null
    };
  }

  // Auth
  async login(email, password) {
    const res = await this.handleRequest(api.post('/auth/login', { email, password }));
    if (res && res.token) {
      this.setToken(res.token);
    }
    return res.data?.user || res.data || res;
  }

  async getMe() {
    const res = await this.handleRequest(api.get('/auth/me'));
    return res.data?.user || res.data || res;
  }

  // Games (Host)
  async createGame() {
    const res = await this.handleRequest(api.post('/games/create'));
    return this.mapGame(res.data?.game || res.game || res);
  }

  async startGame(gameId) {
    const res = await this.handleRequest(api.post(`/games/${gameId}/start`));
    return this.mapGame(res.data?.game || res.game || res);
  }

  async endGame(gameId) {
    const res = await this.handleRequest(api.post(`/games/${gameId}/end`));
    return this.mapGame(res.data?.game || res.game || res);
  }

  async getGameStatus(gameId) {
    const res = await this.handleRequest(api.get(`/games/${gameId}/status`));
    return this.mapGame(res.data?.game || res.game || res);
  }

  async getConnectedPlayers(gameId) {
    const res = await this.handleRequest(api.get(`/games/${gameId}/players`));
    const players = res.data?.players || res.players || [];
    return players.map(p => ({
      ...p,
      id: p.player_id || p.id,
      playerId: p.player_id || p.id,
    }));
  }

  // Rounds (Host)
  async createRound(gameId, roundNumber, presentingHouse) {
    const res = await this.handleRequest(api.post(`/games/${gameId}/rounds/create`, { roundNumber, presentingHouse }));
    return res.data?.round || res.data || res;
  }

  async openBuzzer(gameId, roundId, duration = null) {
    const res = await this.handleRequest(api.post(`/games/${gameId}/rounds/${roundId}/open-buzzer`, { duration }));
    return res.data || res;
  }

  async closeBuzzer(gameId, roundId) {
    const res = await this.handleRequest(api.post(`/games/${gameId}/rounds/${roundId}/close-buzzer`));
    return res.data || res;
  }

  async resetBuzzer(gameId, roundId) {
    const res = await this.handleRequest(api.post(`/games/${gameId}/rounds/${roundId}/reset-buzzer`));
    return res.data || res;
  }

  async getQueue(gameId, roundId) {
    const res = await this.handleRequest(api.get(`/games/${gameId}/rounds/${roundId}/queue`));
    const queue = res.data?.queue || res.queue || [];
    return queue.map(q => ({
      ...q,
      playerId: q.player_id || q.playerId,
      playerName: q.player_name || q.playerName
    }));
  }

  async markAnswer(gameId, roundId, playerId, result) {
    const res = await this.handleRequest(api.post(`/games/${gameId}/rounds/${roundId}/mark-answer`, { playerId, result }));
    return res.data || res;
  }

  // Data Retrieval
  async getScores(gameId) {
    const res = await this.handleRequest(api.get(`/games/${gameId}/scores`));
    const scoresArr = res.data?.scores || res.scores || [];
    if (Array.isArray(scoresArr)) {
      const scoreObj = {};
      scoresArr.forEach(s => {
        scoreObj[s.house] = s.total_points;
      });
      return scoreObj;
    }
    return scoresArr;
  }

  async getStats(gameId) {
    const res = await this.handleRequest(api.get(`/games/${gameId}/stats`));
    return res.data?.stats || res.stats || res.data || res;
  }

  // Student (Players)
  async joinGame(gameCode, name) {
    const res = await this.handleRequest(api.post('/players/join', { gameCode, name }));
    if (res && res.token) {
      this.setToken(res.token);
    }
    const rawPlayer = res.data?.player || res.player;
    const player = rawPlayer ? {
      ...rawPlayer,
      id: rawPlayer.player_id || rawPlayer.id,
      gameId: rawPlayer.game_id || rawPlayer.gameId,
      gameCode: rawPlayer.game_code || rawPlayer.gameCode || gameCode
    } : null;

    if (player) {
      localStorage.setItem('student_session', JSON.stringify({
        player,
        gameCode,
        name,
        house: player.house
      }));
    }

    return {
      ...res,
      player
    };
  }

  async buzz(gameId, roundId) {
    const res = await this.handleRequest(api.post(`/games/${gameId}/rounds/${roundId}/buzz`));
    return res.data || res;
  }

  async sendHeartbeat(playerId) {
    if (!playerId) return;
    const res = await this.handleRequest(api.post(`/players/${playerId}/heartbeat`));
    return res.data || res;
  }
}

export const apiService = new ApiService();