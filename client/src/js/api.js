const API_URL = 'http://localhost:3000/api';

class ApiService {
  constructor() {
    this.token = localStorage.getItem('token');
  }

  setToken(token) {
    this.token = token;
    localStorage.setItem('token', token);
  }

  logout() {
    this.token = null;
    localStorage.removeItem('token');
  }

  async request(endpoint, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const response = await fetch(`${API_URL}${endpoint}`, {
      ...options,
      headers,
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Something went wrong');
    }

    return data;
  }

  // Auth
  async login(email, password) {
    const data = await this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    this.setToken(data.token);
    return data;
  }

  async getMe() {
    return this.request('/auth/me');
  }

  // Games (Host)
  async createGame() {
    return this.request('/games/create', { method: 'POST' });
  }
  
  async startGame(gameId) {
    return this.request(`/games/${gameId}/start`, { method: 'POST' });
  }

  async endGame(gameId) {
    return this.request(`/games/${gameId}/end`, { method: 'POST' });
  }

  async getGameStatus(gameId) {
    return this.request(`/games/${gameId}/status`);
  }

  async getConnectedPlayers(gameId) {
    return this.request(`/games/${gameId}/players`);
  }

  // Rounds (Host)
  async createRound(gameId, roundNumber, presentingHouse) {
    return this.request(`/games/${gameId}/rounds/create`, {
      method: 'POST',
      body: JSON.stringify({ roundNumber, presentingHouse }),
    });
  }

  async openBuzzer(gameId, roundId) {
    return this.request(`/games/${gameId}/rounds/${roundId}/open-buzzer`, { method: 'POST' });
  }

  async closeBuzzer(gameId, roundId) {
    return this.request(`/games/${gameId}/rounds/${roundId}/close-buzzer`, { method: 'POST' });
  }

  async getQueue(gameId, roundId) {
    return this.request(`/games/${gameId}/rounds/${roundId}/queue`);
  }

  async markAnswer(gameId, roundId, playerId, result) {
    return this.request(`/games/${gameId}/rounds/${roundId}/mark-answer`, {
      method: 'POST',
      body: JSON.stringify({ playerId, result }),
    });
  }

  // Data Retrieval
  async getScores(gameId) {
    return this.request(`/games/${gameId}/scores`);
  }

  async getStats(gameId) {
    return this.request(`/games/${gameId}/stats`);
  }

  // Student (Players)
  async joinGame(gameCode, name, house) {
    const data = await this.request('/players/join', {
      method: 'POST',
      body: JSON.stringify({ gameCode, name, house }),
    });
    this.setToken(data.token);
    return data;
  }

  async buzz(gameId, roundId) {
    return this.request(`/games/${gameId}/rounds/${roundId}/buzz`, {
      method: 'POST'
    });
  }

  async sendHeartbeat(playerId) {
    return this.request(`/players/${playerId}/heartbeat`, {
      method: 'POST'
    });
  }
}

const api = new ApiService();
window.api = api;
