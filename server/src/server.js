require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const { Server } = require('socket.io');
const { createClient } = require('redis');
const { createAdapter } = require('@socket.io/redis-adapter');
const winston = require('winston');

// Logger Setup
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.Console({
      format: winston.format.simple(),
    }),
  ],
});

const app = express();
const server = http.createServer(app);

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : '*',
  methods: ['GET', 'POST']
}));
app.use(express.json());

// Setup Socket.io
const io = new Server(server, {
  cors: {
    origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : '*',
    methods: ['GET', 'POST']
  }
});

// Setup Redis Adapter if REDIS_URL is provided
if (process.env.REDIS_URL && process.env.REDIS_URL.trim() !== '') {
  const pubClient = createClient({ url: process.env.REDIS_URL });
  const subClient = pubClient.duplicate();

  Promise.all([pubClient.connect(), subClient.connect()]).then(() => {
    io.adapter(createAdapter(pubClient, subClient));
    logger.info('Redis adapter for Socket.io initialized');
  }).catch((err) => {
    logger.error('Redis connection error:', err);
  });
} else {
  logger.info('No REDIS_URL provided, running without Redis adapter');
}

// Routes
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK' });
});

app.use('/api/auth', require('./routes/auth'));
app.use('/api/games', require('./routes/games'));
app.use('/api/players', require('./routes/players'));

// Serve React Frontend
app.use(express.static(path.join(__dirname, '../../frontend/dist')));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next(); // Skip API routes
  res.sendFile(path.join(__dirname, '../../frontend/dist/index.html'));
});

// Global Error Handler
app.use(require('./middleware/errorHandler'));

// Setup Socket.io Handlers
app.set('io', io);
require('./socket/handlers')(io);

// Background job: Cleanup stale connections
const pool = require('./database/pool');
setInterval(async () => {
  try {
    const res = await pool.query(`
      UPDATE players 
      SET connected = FALSE 
      WHERE connected = TRUE AND last_heartbeat < CURRENT_TIMESTAMP - INTERVAL '60 seconds'
      RETURNING game_id
    `);
    
    // Broadcast player count updates if needed for those games
    if (res.rows.length > 0) {
      const updatedGames = [...new Set(res.rows.map(r => r.game_id))];
      for (const gameId of updatedGames) {
        // Optional: emit to host that players dropped
        io.to(`game:${gameId}`).emit('players:update');
      }
    }
  } catch (err) {
    logger.error('Heartbeat cleanup error:', err);
  }
}, 30000); // Check every 30 seconds

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
});

module.exports = { app, server, io };
