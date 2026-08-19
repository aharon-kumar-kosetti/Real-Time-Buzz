const pool = require('../database/pool');
const { ValidationError, GameStateError, UnauthorizedError } = require('../utils/errors');

exports.buzz = async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { roundId } = req.params;
    const playerId = req.user?.player_id || req.user?.id;

    if (!playerId) {
      throw new UnauthorizedError('Player ID missing from token. Please log in again.');
    }

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
      throw new GameStateError('Buzzer is currently closed / locked');
    }
    
    // 3. Verify player
    const playerResult = await client.query('SELECT * FROM players WHERE player_id = $1', [playerId]);
    const player = playerResult.rows[0];

    if (!player) {
      throw new UnauthorizedError('Player record not found');
    }

    // 4. Check if player's house is presenting (allow all if presenting_house is ALL, OPEN, NONE, or blank)
    const presentingHouse = (round.presenting_house || '').toUpperCase();
    if (presentingHouse && !['ALL', 'NONE', 'OPEN', 'EVERY TEAM'].includes(presentingHouse)) {
      if (player.house.toUpperCase() === presentingHouse) {
        throw new ValidationError(`House ${presentingHouse} is presenting and cannot buzz in this round`);
      }
    }
    
    // 5. Check if player already buzzed this round
    const alreadyBuzzed = await client.query(
      'SELECT queue_id FROM buzz_queue WHERE round_id = $1 AND player_id = $2',
      [roundId, playerId]
    );
    
    if (alreadyBuzzed.rows.length > 0) {
      throw new ValidationError('You have already buzzed for this round');
    }
    
    // 6. Get current queue count
    const queueCountResult = await client.query(
      'SELECT COUNT(*) as count FROM buzz_queue WHERE round_id = $1',
      [roundId]
    );
    
    const currentCount = parseInt(queueCountResult.rows[0].count, 10);
    
    // 7. Insert into queue with server timestamp (unlimited queue)
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
    
    // Update player statistics
    let statColumn = '';
    if (queuePosition === 1) statColumn = 'first_place_buzzes';
    else if (queuePosition === 2) statColumn = 'second_place_buzzes';
    else if (queuePosition === 3) statColumn = 'third_place_buzzes';
    else if (queuePosition === 4) statColumn = 'fourth_place_buzzes';

    if (statColumn) {
      await client.query(
        `INSERT INTO player_statistics (player_id, game_id, total_buzzes, ${statColumn})
         VALUES ($1, $2, 1, 1)
         ON CONFLICT (player_id, game_id) DO UPDATE SET
         total_buzzes = player_statistics.total_buzzes + 1,
         ${statColumn} = player_statistics.${statColumn} + 1`,
        [playerId, round.game_id]
      );
    }

    // Update global total buzzes for house
    await client.query(
      `UPDATE scores SET total_buzzes = total_buzzes + 1 WHERE game_id = $1 AND house = $2`,
      [round.game_id, player.house]
    );

    // Fetch complete ordered queue
    const fullQueueResult = await client.query(
      'SELECT player_id, player_name, house, queue_position, status FROM buzz_queue WHERE round_id = $1 ORDER BY queue_position ASC',
      [roundId]
    );

    await client.query('COMMIT');
    
    // Broadcast queue update to all connected clients in game
    const io = req.app.get('io');
    io.to(`game:${round.game_id}`).emit('buzz:queue-update', {
      roundId,
      queuePosition,
      playerId,
      playerName: player.name,
      house: player.house,
      timestamp: serverTime,
      isAnswering: queuePosition === 1,
      queue: fullQueueResult.rows.map(q => ({
        playerId: q.player_id,
        playerName: q.player_name,
        house: q.house,
        queuePosition: q.queue_position,
        status: q.status
      }))
    });

    res.status(200).json({
      status: 'success',
      data: {
        queuePosition: result.rows[0].queue_position,
        queue: fullQueueResult.rows
      }
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
};
