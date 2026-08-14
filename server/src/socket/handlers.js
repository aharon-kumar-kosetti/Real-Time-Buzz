const winston = require('winston');
const pool = require('../database/pool');

module.exports = (io) => {
  io.on('connection', (socket) => {
    winston.info(`New connection: ${socket.id}`);

    // Client explicitly joins a game room
    socket.on('player:join', async ({ gameId, playerId, role }) => {
      if (!gameId) return;
      
      const room = `game:${gameId}`;
      socket.join(room);
      winston.info(`Socket ${socket.id} joined room ${room} as ${role}`);

      // If it's a student, we can optionally broadcast they connected
      if (role === 'student' && playerId) {
        // Mark connected in DB
        try {
          await pool.query(
            'UPDATE players SET connected = TRUE, last_heartbeat = CURRENT_TIMESTAMP WHERE player_id = $1',
            [playerId]
          );
          io.to(room).emit('player:connected', { playerId });
        } catch (err) {
          winston.error('Error updating player connection status:', err);
        }
      }
    });

    socket.on('disconnect', () => {
      winston.info(`Disconnected: ${socket.id}`);
      // Usually, a heartbeat mechanism handles actual logical disconnections for students
      // instead of relying entirely on socket disconnects because of mobile flakiness.
    });
  });
};
