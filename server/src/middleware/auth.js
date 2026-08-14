const jwt = require('jsonwebtoken');
const { UnauthorizedError, ForbiddenError } = require('../utils/errors');
const pool = require('../database/pool');

const verifyToken = async (req, res, next) => {
  try {
    let token;
    
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    } else if (req.cookies?.jwt) {
      token = req.cookies.jwt;
    }

    if (!token) {
      throw new UnauthorizedError('You are not logged in. Please log in to get access.');
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Check if user still exists
    let user;
    if (decoded.role === 'host') {
      const userResult = await pool.query('SELECT * FROM users WHERE user_id = $1', [decoded.id]);
      user = userResult.rows[0];
    } else {
      const playerResult = await pool.query('SELECT * FROM players WHERE player_id = $1', [decoded.id]);
      user = playerResult.rows[0];
    }

    if (!user) {
      throw new UnauthorizedError('The user belonging to this token does no longer exist.');
    }

    // Grant access to protected route
    req.user = { ...user, role: decoded.role };
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      next(new UnauthorizedError('Invalid token. Please log in again.'));
    } else if (error.name === 'TokenExpiredError') {
      next(new UnauthorizedError('Your token has expired. Please log in again.'));
    } else {
      next(error);
    }
  }
};

const restrictTo = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return next(new ForbiddenError('You do not have permission to perform this action'));
    }
    next();
  };
};

module.exports = { verifyToken, restrictTo };
