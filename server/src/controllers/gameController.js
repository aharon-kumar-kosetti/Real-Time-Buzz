const pool = require('../database/pool');
const { ValidationError, GameStateError, ForbiddenError } = require('../utils/errors');
const { generateGameCode } = require('../utils/helpers');

exports.createGame = async (req, res, next) => {
  try {
    const hostId = req.user.user_id; // From verifyToken middleware
    const gameCode = generateGameCode();

    const result = await pool.query(
      'INSERT INTO games (game_code, host_id) VALUES ($1, $2) RETURNING game_id, game_code, status, created_at',
      [gameCode, hostId]
    );

    res.status(201).json({
      status: 'success',
      data: {
        game: result.rows[0]
      }
    });
  } catch (error) {
    next(error);
  }
};

exports.startGame = async (req, res, next) => {
  try {
    const { gameId } = req.params;
    const hostId = req.user.user_id;

    // Verify ownership and state
    const gameResult = await pool.query('SELECT * FROM games WHERE game_id = $1', [gameId]);
    const game = gameResult.rows[0];

    if (!game) return next(new ValidationError('Game not found', 404));
    if (game.host_id !== hostId) return next(new ForbiddenError('You are not the host of this game'));
    if (game.status !== 'LOBBY') return next(new GameStateError('Game has already started or ended'));

    const updateResult = await pool.query(
      `UPDATE games 
       SET status = 'ACTIVE', started_at = CURRENT_TIMESTAMP 
       WHERE game_id = $1 
       RETURNING *`,
      [gameId]
    );

    res.status(200).json({
      status: 'success',
      data: {
        game: updateResult.rows[0]
      }
    });
  } catch (error) {
    next(error);
  }
};

exports.endGame = async (req, res, next) => {
  try {
    const { gameId } = req.params;
    const hostId = req.user.user_id;

    const gameResult = await pool.query('SELECT * FROM games WHERE game_id = $1', [gameId]);
    const game = gameResult.rows[0];

    if (!game) return next(new ValidationError('Game not found', 404));
    if (game.host_id !== hostId) return next(new ForbiddenError('You are not the host of this game'));
    if (game.status === 'COMPLETED') return next(new GameStateError('Game is already completed'));

    const updateResult = await pool.query(
      `UPDATE games 
       SET status = 'COMPLETED', ended_at = CURRENT_TIMESTAMP 
       WHERE game_id = $1 
       RETURNING *`,
      [gameId]
    );

    res.status(200).json({
      status: 'success',
      data: {
        game: updateResult.rows[0]
      }
    });
  } catch (error) {
    next(error);
  }
};

exports.getGameStatus = async (req, res, next) => {
  try {
    const { gameId } = req.params;
    const gameResult = await pool.query('SELECT * FROM games WHERE game_id = $1', [gameId]);
    const game = gameResult.rows[0];

    if (!game) return next(new ValidationError('Game not found', 404));

    // Fetch active round
    const roundResult = await pool.query("SELECT * FROM rounds WHERE game_id = $1 AND status = 'ACTIVE' ORDER BY created_at DESC LIMIT 1", [gameId]);
    if (roundResult.rows.length > 0) {
      game.currentRound = roundResult.rows[0];
    }

    res.status(200).json({
      status: 'success',
      data: {
        game
      }
    });
  } catch (error) {
    next(error);
  }
};

exports.getConnectedPlayers = async (req, res, next) => {
  try {
    const { gameId } = req.params;
    
    const playersResult = await pool.query(
      'SELECT player_id, name, house, player_code, connected, connected_at FROM players WHERE game_id = $1',
      [gameId]
    );

    res.status(200).json({
      status: 'success',
      results: playersResult.rows.length,
      data: {
        players: playersResult.rows
      }
    });
  } catch (error) {
    next(error);
  }
};
