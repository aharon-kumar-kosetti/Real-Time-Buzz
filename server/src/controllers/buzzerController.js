const pool = require('../database/pool');
const { ValidationError, GameStateError, UnauthorizedError } = require('../utils/errors');

exports.buzz = async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { roundId } = req.params;
    const playerId = req.user.player_id; // From JWT

    // 1. Start transaction
    await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
    
    // 2. Lock the round for this buzz
    const roundResult = await client.query(
      'SELECT * FROM rounds WHERE round_id = $1 FOR UPDATE',
      [roundId]
    );
    
    if (roundResult.rows.length === 0) {
      throw new ValidationError('Round not found');
    }

    const round = roundResult.rows[0];
    
    if (round.status !== 'BUZZER_OPEN') {
      throw new GameStateError('Buzzer is not open');
    }
    
    // 3. Verify player
    const playerResult = await client.query('SELECT * FROM players WHERE player_id = $1', [playerId]);
    const player = playerResult.rows[0];

    if (!player) {
      throw new UnauthorizedError('Player not found');
    }

    // 4. Check if player's house is presenting
    if (player.house === round.presenting_house) {
      throw new ValidationError('Presenting house cannot buzz');
    }
    
    // 5. Check if player already buzzed this round
    const alreadyBuzzed = await client.query(
      'SELECT queue_id FROM buzz_queue WHERE round_id = $1 AND player_id = $2',
      [roundId, playerId]
    );
    
    if (alreadyBuzzed.rows.length > 0) {
      throw new ValidationError('Player already buzzed');
    }
    
    // 6. Get current queue count
    const queueCountResult = await client.query(
      'SELECT COUNT(*) as count FROM buzz_queue WHERE round_id = $1',
      [roundId]
    );
    
    const currentCount = parseInt(queueCountResult.rows[0].count);
    
    if (currentCount >= 4) {
      throw new ValidationError('Queue is full');
    }
    
    // 7. Insert into queue with server timestamp
    const serverTime = Date.now();
    const queuePosition = currentCount + 1;
    
    const result = await client.query(
      `INSERT INTO buzz_queue 
       (round_id, player_id, player_name, house, queue_position, server_timestamp, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'WAITING')
       RETURNING queue_id, queue_position`,
      [roundId, playerId, player.name, player.house, queuePosition, serverTime]
    );
    
    // 8. If first player, automatically start answering
    if (queuePosition === 1) {
      await client.query(
        "UPDATE buzz_queue SET status = 'ANSWERING' WHERE queue_id = $1",
        [result.rows[0].queue_id]
      );
      
      await client.query(
        'UPDATE rounds SET current_answering_player_id = $1, answer_start_time = NOW() WHERE round_id = $2',
        [playerId, roundId]
      );
    }
    
    // If we just filled the queue (this was the 4th person), optionally auto-lock the buzzer
    if (queuePosition === 4) {
      await client.query("UPDATE rounds SET status = 'BUZZER_LOCKED' WHERE round_id = $1", [roundId]);
    }
    
    // Update player statistics
    let statColumn = '';
    if (queuePosition === 1) statColumn = 'first_place_buzzes';
    else if (queuePosition === 2) statColumn = 'second_place_buzzes';
    else if (queuePosition === 3) statColumn = 'third_place_buzzes';
    else if (queuePosition === 4) statColumn = 'fourth_place_buzzes';

    await client.query(
      `INSERT INTO player_statistics (player_id, game_id, total_buzzes, ${statColumn})
       VALUES ($1, $2, 1, 1)
       ON CONFLICT (player_id, game_id) DO UPDATE SET
       total_buzzes = player_statistics.total_buzzes + 1,
       ${statColumn} = player_statistics.${statColumn} + 1`,
      [playerId, round.game_id]
    );

    // Update global total buzzes for house
    await client.query(
      `UPDATE scores SET total_buzzes = total_buzzes + 1 WHERE game_id = $1 AND house = $2`,
      [round.game_id, player.house]
    );

    await client.query('COMMIT');
    
    // Broadcast queue update to all clients
    const io = req.app.get('io');
    io.to(`game:${round.game_id}`).emit('buzz:queue-update', {
      roundId,
      queuePosition,
      playerId,
      playerName: player.name,
      house: player.house,
      timestamp: serverTime,
      isAnswering: queuePosition === 1
    });
    
    // If buzzer locked, broadcast that too
    if (queuePosition === 4) {
      io.to(`game:${round.game_id}`).emit('round:status-change', {
        roundId,
        status: 'BUZZER_LOCKED'
      });
    }

    res.status(200).json({
      status: 'success',
      data: {
        queuePosition: result.rows[0].queue_position
      }
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
};
