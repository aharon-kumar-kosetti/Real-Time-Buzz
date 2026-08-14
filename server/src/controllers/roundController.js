const pool = require('../database/pool');
const { ValidationError, GameStateError } = require('../utils/errors');

exports.createRound = async (req, res, next) => {
  try {
    const { gameId } = req.params;
    const { roundNumber, presentingHouse } = req.body;

    if (!roundNumber || !presentingHouse) {
      return next(new ValidationError('Round number and presenting house are required'));
    }

    // Verify game exists and belongs to host
    const gameResult = await pool.query('SELECT * FROM games WHERE game_id = $1', [gameId]);
    if (gameResult.rows.length === 0) return next(new ValidationError('Game not found', 404));
    
    if (gameResult.rows[0].host_id !== req.user.user_id) {
      return next(new ValidationError('Not authorized for this game', 403));
    }

    const result = await pool.query(
      `INSERT INTO rounds (game_id, round_number, presenting_house, status) 
       VALUES ($1, $2, $3, 'ACTIVE') 
       RETURNING *`,
      [gameId, roundNumber, presentingHouse]
    );

    // Update current_round_number on game
    await pool.query('UPDATE games SET current_round_number = $1, presenting_house = $2 WHERE game_id = $3', [roundNumber, presentingHouse, gameId]);

    res.status(201).json({
      status: 'success',
      data: {
        round: result.rows[0]
      }
    });
  } catch (error) {
    next(error);
  }
};

exports.openBuzzer = async (req, res, next) => {
  try {
    const { roundId } = req.params;
    
    // Check round exists and is ACTIVE
    const roundResult = await pool.query('SELECT * FROM rounds WHERE round_id = $1', [roundId]);
    if (roundResult.rows.length === 0) return next(new ValidationError('Round not found', 404));
    if (roundResult.rows[0].status !== 'ACTIVE') return next(new GameStateError('Round is not active'));

    const result = await pool.query(
      "UPDATE rounds SET status = 'BUZZER_OPEN' WHERE round_id = $1 RETURNING *",
      [roundId]
    );

    const io = req.app.get('io');
    io.to(`game:${roundResult.rows[0].game_id}`).emit('round:status-change', {
      roundId,
      status: 'BUZZER_OPEN'
    });
    
    res.status(200).json({
      status: 'success',
      data: {
        round: result.rows[0]
      }
    });
  } catch (error) {
    next(error);
  }
};

exports.closeBuzzer = async (req, res, next) => {
  try {
    const { roundId } = req.params;
    
    const result = await pool.query(
      "UPDATE rounds SET status = 'BUZZER_LOCKED' WHERE round_id = $1 AND status = 'BUZZER_OPEN' RETURNING *",
      [roundId]
    );

    if (result.rows.length === 0) {
      return next(new GameStateError('Buzzer is not currently open'));
    }

    const roundResult = await pool.query('SELECT game_id FROM rounds WHERE round_id = $1', [roundId]);
    const io = req.app.get('io');
    io.to(`game:${roundResult.rows[0].game_id}`).emit('round:status-change', {
      roundId,
      status: 'BUZZER_LOCKED'
    });

    res.status(200).json({
      status: 'success',
      data: {
        round: result.rows[0]
      }
    });
  } catch (error) {
    next(error);
  }
};

exports.getQueue = async (req, res, next) => {
  try {
    const { roundId } = req.params;
    
    const queueResult = await pool.query(
      'SELECT * FROM buzz_queue WHERE round_id = $1 ORDER BY queue_position ASC',
      [roundId]
    );

    res.status(200).json({
      status: 'success',
      results: queueResult.rows.length,
      data: {
        queue: queueResult.rows
      }
    });
  } catch (error) {
    next(error);
  }
};

exports.markAnswer = async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { gameId, roundId } = req.params;
    const { playerId, result } = req.body; // result: CORRECT, WRONG, TIMEOUT

    if (!['CORRECT', 'WRONG', 'TIMEOUT'].includes(result)) {
      return next(new ValidationError('Invalid result type'));
    }

    await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');

    // Get game scoring rules
    const gameResult = await client.query('SELECT * FROM games WHERE game_id = $1', [gameId]);
    const game = gameResult.rows[0];

    // Get the queue entry for this player
    const queueResult = await client.query(
      "SELECT * FROM buzz_queue WHERE round_id = $1 AND player_id = $2 AND status = 'ANSWERING' FOR UPDATE",
      [roundId, playerId]
    );

    if (queueResult.rows.length === 0) {
      throw new GameStateError('Player is not currently answering');
    }
    
    const currentQueue = queueResult.rows[0];

    // Update buzz queue status
    await client.query(
      'UPDATE buzz_queue SET status = $1, answer_result = $1 WHERE queue_id = $2',
      [result, currentQueue.queue_id]
    );

    // Calculate points based on result
    let points = 0;
    if (result === 'CORRECT') points = game.correct_points;
    else if (result === 'WRONG') points = game.wrong_points;
    else if (result === 'TIMEOUT') points = game.timeout_points;

    // Update scores table
    await client.query(
      `UPDATE scores 
       SET total_points = total_points + $1,
           correct_answers = correct_answers + $2,
           wrong_answers = wrong_answers + $3
       WHERE game_id = $4 AND house = $5`,
      [
        points,
        result === 'CORRECT' ? 1 : 0,
        result === 'WRONG' || result === 'TIMEOUT' ? 1 : 0,
        gameId,
        currentQueue.house
      ]
    );

    // Update player statistics
    await client.query(
      `INSERT INTO player_statistics (player_id, game_id, correct_answers, wrong_answers, timeout_count)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (player_id, game_id) DO UPDATE SET
       correct_answers = player_statistics.correct_answers + $3,
       wrong_answers = player_statistics.wrong_answers + $4,
       timeout_count = player_statistics.timeout_count + $5`,
      [
        playerId,
        gameId,
        result === 'CORRECT' ? 1 : 0,
        result === 'WRONG' ? 1 : 0,
        result === 'TIMEOUT' ? 1 : 0
      ]
    );

    let nextPlayer = null;

    if (result === 'CORRECT') {
      // Round over
      await client.query("UPDATE rounds SET status = 'COMPLETED' WHERE round_id = $1", [roundId]);
      
      // Record round result
      await client.query(
        'INSERT INTO round_results (round_id, presenting_house, correct_house, correct_player_id, points_awarded) VALUES ($1, $2, $3, $4, $5)',
        [roundId, game.presenting_house, currentQueue.house, playerId, points]
      );
    } else {
      // Find next player in queue
      const nextQueueResult = await client.query(
        "SELECT * FROM buzz_queue WHERE round_id = $1 AND queue_position = $2",
        [roundId, currentQueue.queue_position + 1]
      );

      if (nextQueueResult.rows.length > 0) {
        nextPlayer = nextQueueResult.rows[0];
        
        await client.query(
          "UPDATE buzz_queue SET status = 'ANSWERING' WHERE queue_id = $1",
          [nextPlayer.queue_id]
        );
        
        await client.query(
          "UPDATE rounds SET current_answering_player_id = $1, answer_start_time = NOW() WHERE round_id = $2",
          [nextPlayer.player_id, roundId]
        );
      } else {
        // No one left in queue, round over
        await client.query("UPDATE rounds SET status = 'COMPLETED' WHERE round_id = $1", [roundId]);
      }
    }

    await client.query('COMMIT');

    // Broadcast score updates and next player
    const io = req.app.get('io');
    io.to(`game:${gameId}`).emit('answer:result', {
      roundId,
      playerId,
      result,
      pointsAwarded: points,
      nextPlayer: nextPlayer ? {
        playerId: nextPlayer.player_id,
        playerName: nextPlayer.player_name,
        house: nextPlayer.house
      } : null,
      roundStatus: result === 'CORRECT' || !nextPlayer ? 'COMPLETED' : 'ACTIVE'
    });

    // Also broadcast full scores batch update
    const allScores = await pool.query('SELECT house, total_points FROM scores WHERE game_id = $1', [gameId]);
    io.to(`game:${gameId}`).emit('game:scores-update', allScores.rows);

    res.status(200).json({
      status: 'success',
      data: {
        pointsAwarded: points,
        nextPlayer
      }
    });

  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
};
