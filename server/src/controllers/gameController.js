const pool = require('../database/pool');
const { ValidationError, GameStateError, ForbiddenError } = require('../utils/errors');
const { generateGameCode, VALID_HOUSES } = require('../utils/helpers');

exports.createGame = async (req, res, next) => {
  const client = await pool.connect();
  try {
    const hostId = req.user.user_id; // From verifyToken middleware
    await client.query('BEGIN');

    const gameCode = generateGameCode();

    const result = await client.query(
      'INSERT INTO games (game_code, host_id) VALUES ($1, $2) RETURNING game_id, game_code, status, created_at',
      [gameCode, hostId]
    );
    const game = result.rows[0];
    const houseCodes = {};

    for (const house of VALID_HOUSES) {
      let houseCode;
      let inserted = false;
      while (!inserted) {
        houseCode = generateGameCode();
        try {
          await client.query(
            'INSERT INTO game_house_codes (game_id, house, game_code) VALUES ($1, $2, $3)',
            [game.game_id, house, houseCode]
          );
          inserted = true;
        } catch (error) {
          if (error.code !== '23505') throw error;
        }
      }
      houseCodes[house] = houseCode;
    }

    await client.query('COMMIT');
    game.house_codes = houseCodes;

    res.status(201).json({
      status: 'success',
      data: {
        game
      }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
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

    // Fetch latest round (whether ACTIVE, BUZZER_OPEN, or BUZZER_LOCKED)
    const roundResult = await pool.query(
      "SELECT * FROM rounds WHERE game_id = $1 ORDER BY created_at DESC LIMIT 1",
      [gameId]
    );
    if (roundResult.rows.length > 0) {
      game.currentRound = roundResult.rows[0];
    }

    const houseCodesResult = await pool.query(
      'SELECT house, game_code FROM game_house_codes WHERE game_id = $1 ORDER BY house',
      [gameId]
    );
    game.house_codes = houseCodesResult.rows.reduce((codes, row) => {
      codes[row.house] = row.game_code;
      return codes;
    }, {});

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
