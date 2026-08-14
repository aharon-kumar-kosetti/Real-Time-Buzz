const SOCKET_URL = 'http://localhost:3000';

class SocketService {
  constructor() {
    this.socket = null;
    this.listeners = {};
  }

  connect(gameId, playerId, role) {
    // Requires including socket.io-client via CDN in the HTML
    this.socket = io(SOCKET_URL);

    this.socket.on('connect', () => {
      console.log('Connected to WebSocket server');
      this.socket.emit('player:join', { gameId, playerId, role });
    });

    this.socket.on('disconnect', () => {
      console.log('Disconnected from WebSocket server');
    });

    // Register all standard game events
    const events = [
      'round:status-change',
      'buzz:queue-update',
      'answer:result',
      'game:scores-update',
      'player:connected'
    ];

    events.forEach(event => {
      this.socket.on(event, (data) => {
        if (this.listeners[event]) {
          this.listeners[event].forEach(cb => cb(data));
        }
      });
    });
  }

  on(event, callback) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
  }

  off(event, callback) {
    if (this.listeners[event]) {
      this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
    }
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
    }
  }
}

const socketService = new SocketService();
window.socketService = socketService;
