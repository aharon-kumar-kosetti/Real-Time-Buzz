const pool = require('../database/pool');
const { ValidationError, GameStateError } = require('../utils/errors');
const { generateSessionToken } = require('../utils/helpers');
const jwt = require('jsonwebtoken');

const VALID_HOUSES = ['PRUDHVI', 'AGNI', 'JAL', 'VAYU', 'AKASH'];

// A function to issue a JWT specifically for students, since students don't 'register' with a password
const signStudentToken = (id) => {
  return jwt.sign({ id, role: 'student' }, process.env.JWT_SECRET, {
    expiresIn: '24h'
  });
};

exports.joinGame = async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { gameCode, name, house } = req.body;

    // 1. Input Validation
    if (!gameCode || !name || !house) {
      return next(new ValidationError('Missing required fields'));
    }
    const cleanName = name.trim();
    if (cleanName.length < 2 || cleanName.length > 30) {
      return next(new ValidationError('Name must be between 2 and 30 characters'));
    }
    const cleanHouse = house.toUpperCase();
    if (!VALID_HOUSES.includes(cleanHouse)) {
      return next(new ValidationError('Invalid house selection'));
    }

    await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');

    // 2. Game Lookup
    const gameResult = await client.query('SELECT game_id, status FROM games WHERE game_code = $1', [gameCode]);
    const game = gameResult.rows[0];

    if (!game) {
      throw new ValidationError('Invalid game code.');
    }
    
    // Some logic might prevent joining if game is completed
    if (game.status === 'COMPLETED') {
      throw new GameStateError('This game has already ended.');
    }

    // 3. Prevent Duplicates
    const existingPlayer = await client.query(
      'SELECT player_id FROM players WHERE game_id = $1 AND name = $2 AND house = $3',
      [game.game_id, cleanName, cleanHouse]
    );

    if (existingPlayer.rows.length > 0) {
      throw new ValidationError('A player with this name already exists in this house');
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
    
    // Also init their scores row if not exist
    await client.query(`
      INSERT INTO scores (game_id, house) 
      VALUES ($1, $2) 
      ON CONFLICT (game_id, house) DO NOTHING
    `, [game.game_id, house]);

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
