const { Pool } = require('pg');
require('dotenv').config();

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required. Add it to the server environment variables before starting the backend.');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL.split('?')[0],
  max: 50, // Max connections per server
  idleTimeoutMillis: 60000,
  connectionTimeoutMillis: 10000,
  ssl: { rejectUnauthorized: false }
});

pool.on('error', (err, client) => {
  console.error('Unexpected error on idle client (safe to ignore, pool will reconnect)', err.message);
  // Do not crash the server on idle connection timeouts!
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  connect: () => pool.connect(),
};
