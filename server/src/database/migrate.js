require('dotenv').config();
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const pool = require('./pool');
const { generateGameCode, VALID_HOUSES } = require('../utils/helpers');

async function migrateAndSeed() {
  console.log('--- Starting Database Migration & Seeding ---');
  try {
    // 1. Read schema.sql
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');
    
    console.log('Applying schema.sql...');
    await pool.query(schemaSql);
    console.log(' Schema tables and indexes applied successfully!');

    // 2. Hash default password for host
    const defaultUsername = 'user';
    const defaultPassword = 'ironman';
    const defaultRole = 'host';

    const salt = await bcrypt.genSalt(12);
    const passwordHash = await bcrypt.hash(defaultPassword, salt);

    // 3. Upsert default host user
    const existing = await pool.query('SELECT user_id, email, role FROM users WHERE LOWER(email) = LOWER($1)', [defaultUsername]);
    
    if (existing.rows.length > 0) {
      await pool.query(
        'UPDATE users SET password_hash = $1, role = $2 WHERE user_id = $3',
        [passwordHash, defaultRole, existing.rows[0].user_id]
      );
      console.log(` Updated existing default host user: "${defaultUsername}" with password "${defaultPassword}".`);
    } else {
      await pool.query(
        'INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3)',
        [defaultUsername, passwordHash, defaultRole]
      );
      console.log(` Created default host user: "${defaultUsername}" with password "${defaultPassword}".`);
    }

    // Backfill house-specific codes for games created before this feature.
    const games = await pool.query('SELECT game_id FROM games');
    for (const game of games.rows) {
      for (const house of VALID_HOUSES) {
        const existingCode = await pool.query(
          'SELECT 1 FROM game_house_codes WHERE game_id = $1 AND house = $2',
          [game.game_id, house]
        );
        if (existingCode.rows.length > 0) continue;

        let inserted = false;
        while (!inserted) {
          try {
            await pool.query(
              'INSERT INTO game_house_codes (game_id, house, game_code) VALUES ($1, $2, $3)',
              [game.game_id, house, generateGameCode()]
            );
            inserted = true;
          } catch (error) {
            if (error.code !== '23505') throw error;
          }
        }
      }
    }

    console.log('--- Database Setup Complete ---');
    process.exit(0);
  } catch (err) {
    console.error(' Migration failed:', err);
    process.exit(1);
  }
}

migrateAndSeed();
