const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../database/pool');
const { ValidationError, UnauthorizedError } = require('../utils/errors');

const signToken = (id, role) => {
  return jwt.sign({ id, role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRY || '7d'
  });
};

const createSendToken = (user, statusCode, res) => {
  const token = signToken(user.user_id, user.role);

  // Remove password from output
  user.password_hash = undefined;

  res.status(statusCode).json({
    status: 'success',
    token,
    data: {
      user
    }
  });
};

exports.register = async (req, res, next) => {
  try {
    const { email, password, role } = req.body;

    if (!email || !password) {
      return next(new ValidationError('Please provide email and password!'));
    }
    if (role !== 'host') {
      return next(new ValidationError('Only host registration is allowed through this endpoint.'));
    }

    // Check if user exists
    const existingUser = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (existingUser.rows.length > 0) {
      return next(new ValidationError('Email already in use.'));
    }

    // Hash password
    const salt = await bcrypt.genSalt(12);
    const passwordHash = await bcrypt.hash(password, salt);

    // Create user
    const newUser = await pool.query(
      'INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING user_id, email, role, created_at',
      [email, passwordHash, role]
    );

    createSendToken(newUser.rows[0], 201, res);
  } catch (error) {
    next(error);
  }
};

exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // 1) Check if email and password exist
    if (!email || !password) {
      return next(new ValidationError('Please provide email and password!'));
    }

    // 2) Check if user exists && password is correct
    const result = await pool.query('SELECT * FROM users WHERE LOWER(email) = LOWER($1)', [email.trim()]);
    const user = result.rows[0];

    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return next(new UnauthorizedError('Incorrect email or password'));
    }

    // 3) If everything ok, send token to client
    createSendToken(user, 200, res);
  } catch (error) {
    next(error);
  }
};

exports.logout = (req, res) => {
  // Client is responsible for deleting the token, we can just send a success response
  res.status(200).json({ status: 'success', message: 'Logged out successfully' });
};

exports.getMe = async (req, res, next) => {
  try {
    const user = req.user;
    if (user.password_hash) user.password_hash = undefined;
    
    res.status(200).json({
      status: 'success',
      data: {
        user
      }
    });
  } catch (error) {
    next(error);
  }
};
