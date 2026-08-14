const pool = require('../database/pool');

exports.getScores = async (req, res, next) => {
  try {
    const { gameId } = req.params;
    
    const result = await pool.query(
      'SELECT house, total_points, correct_answers, wrong_answers, total_buzzes FROM scores WHERE game_id = $1 ORDER BY total_points DESC',
      [gameId]
    );

    res.status(200).json({
      status: 'success',
      data: {
        scores: result.rows
      }
    });
  } catch (error) {
    next(error);
  }
};

exports.getStats = async (req, res, next) => {
  try {
    const { gameId } = req.params;
    
    // Top 10 fastest buzzing players who actually got it correct
    const fastestBuzzersResult = await pool.query(`
      SELECT p.name, p.house, p.player_code, b.reaction_time
      FROM buzz_queue b
      JOIN players p ON b.player_id = p.player_id
      WHERE b.status = 'CORRECT' AND p.game_id = $1 AND b.reaction_time IS NOT NULL
      ORDER BY b.reaction_time ASC
      LIMIT 10
    `, [gameId]);
    
    // Top players by total correct answers
    const topPlayersResult = await pool.query(`
      SELECT p.name, p.house, p.player_code, s.correct_answers, s.total_buzzes
      FROM player_statistics s
      JOIN players p ON s.player_id = p.player_id
      WHERE s.game_id = $1 AND s.correct_answers > 0
      ORDER BY s.correct_answers DESC, s.total_buzzes ASC
      LIMIT 10
    `, [gameId]);

    // Breakdown of round results
    const roundResults = await pool.query(`
      SELECT round_id, presenting_house, correct_house, points_awarded, created_at
      FROM round_results
      WHERE round_id IN (SELECT round_id FROM rounds WHERE game_id = $1)
      ORDER BY created_at ASC
    `, [gameId]);

    res.status(200).json({
      status: 'success',
      data: {
        fastestBuzzers: fastestBuzzersResult.rows,
        topPlayers: topPlayersResult.rows,
        roundResults: roundResults.rows
      }
    });
  } catch (error) {
    next(error);
  }
};
