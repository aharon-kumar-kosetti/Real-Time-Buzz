const crypto = require('crypto');

exports.generateGameCode = () => {
  // Generate a random 6-character alphanumeric game code
  return crypto.randomBytes(3).toString('hex').toUpperCase();
};

exports.generateSessionToken = () => {
  return crypto.randomBytes(32).toString('hex');
};
