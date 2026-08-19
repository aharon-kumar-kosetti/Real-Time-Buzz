const pool = require('../database/pool');
const { ValidationError, GameStateError } = require('../utils/errors');
const { generateSessionToken } = require('../utils/helpers');
const jwt = require('jsonwebtoken');

// A function to issue a JWT specifically for students, since students don't 'register' with a password
const signStudentToken = (id) => {
  return jwt.sign({ id, role: 'student' }, process.env.JWT_SECRET, {
    expiresIn: '24h'
  });
};

exports.joinGame = async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { gameCode, name } = req.body;

    // 1. Input Validation
    if (!gameCode || !name) {
      return next(new ValidationError('Missing required fields'));
    }
    const cleanName = name.trim();
    if (cleanName.length < 2 || cleanName.length > 30) {
      return next(new ValidationError('Name must be between 2 and 30 characters'));
    }
    await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');

    // 2. Game Lookup
    const gameResult = await client.query(
      `SELECT g.game_id, g.status, COALESCE(ghc.house, 'PRUDHVI') AS house
       FROM games g
       LEFT JOIN game_house_codes ghc ON ghc.game_id = g.game_id
       WHERE ghc.game_code = $1 OR g.game_code = $1
       LIMIT 1`,
      [gameCode.trim().toUpperCase()]
    );
    const game = gameResult.rows[0];

    if (!game) {
      throw new ValidationError('Invalid game code.');
    }
    
    // Some logic might prevent joining if game is completed
    if (game.status === 'COMPLETED') {
      throw new GameStateError('This game has already ended.');
    }
    const cleanHouse = game.house;

    // 3. Prevent Duplicates / Allow Reconnect
    const existingPlayer = await client.query(
      `SELECT player_id, game_id, name, house, player_code, session_token, connected 
       FROM players 
       WHERE game_id = $1 AND LOWER(name) = LOWER($2) AND house = $3`,
      [game.game_id, cleanName, cleanHouse]
    );

    if (existingPlayer.rows.length > 0) {
      const existing = existingPlayer.rows[0];
      await client.query(
        'UPDATE players SET connected = TRUE, last_heartbeat = CURRENT_TIMESTAMP WHERE player_id = $1',
        [existing.player_id]
      );
      await client.query('COMMIT');
      
      const token = signStudentToken(existing.player_id);
      existing.game_code = gameCode;

      return res.status(200).json({
        status: 'success',
        token,
        data: {
          player: existing
        }
      });
    }

    // 4. Generate sequential player code per house per game
    const countResult = await client.query(
      'SELECT COUNT(*) FROM players WHERE game_id = $1 AND house = $2',
      [game.game_id, cleanHouse]
    );
    const housePlayerCount = parseInt(countResult.rows[0].count, 10);

    const maxPlayers = parseInt(process.env.MAX_PLAYERS_PER_HOUSE || '200', 10);
    if (housePlayerCount >= maxPlayers) {
      throw new ValidationError('Maximum players reached for this house.');
    }

    const playerCode = `${cleanHouse}-${String(housePlayerCount + 1).padStart(3, '0')}`;
    const sessionToken = generateSessionToken();

    // 5. Insert player
    const insertResult = await client.query(
      `INSERT INTO players (game_id, name, house, player_code, session_token, connected) 
       VALUES ($1, $2, $3, $4, $5, TRUE) 
       RETURNING player_id, game_id, name, house, player_code, session_token, connected`,
      [game.game_id, cleanName, cleanHouse, playerCode, sessionToken]
    );

    const newPlayer = insertResult.rows[0];
    newPlayer.game_code = gameCode;
    
    // Also init their scores row if not exist
    await client.query(`
      INSERT INTO scores (game_id, house) 
      VALUES ($1, $2) 
      ON CONFLICT (game_id, house) DO NOTHING
    `, [game.game_id, cleanHouse]);

    await client.query('COMMIT');

    // Generate JWT token for student API access
    const token = signStudentToken(newPlayer.player_id);

    res.status(201).json({
      status: 'success',
      token,
      data: {
        player: newPlayer
      }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
};

exports.heartbeat = async (req, res, next) => {
  try {
    const { playerId } = req.params;
    
    // Optionally check if req.user.id matches playerId if we are using JWT for students
    if (req.user && req.user.player_id !== playerId) {
      // ignore or throw error
    }

    await pool.query(
      'UPDATE players SET connected = TRUE, last_heartbeat = CURRENT_TIMESTAMP WHERE player_id = $1',
      [playerId]
    );

    res.status(200).json({ status: 'success' });
  } catch (error) {
    next(error);
  }
};
