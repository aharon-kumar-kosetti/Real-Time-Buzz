const crypto = require('crypto');

exports.generateGameCode = () => {
  return crypto.randomBytes(3).toString('hex').toUpperCase();
};

exports.VALID_HOUSES = ['PRUDHVI', 'AGNI', 'JAL', 'VAYU', 'AKASH'];

exports.generateSessionToken = () => {
  return crypto.randomBytes(32).toString('hex');
};
