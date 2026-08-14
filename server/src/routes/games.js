const express = require('express');
const gameController = require('../controllers/gameController');
const { verifyToken, restrictTo } = require('../middleware/auth');

const router = express.Router();

// Protected host routes
router.post('/create', verifyToken, restrictTo('host'), gameController.createGame);
router.post('/:gameId/start', verifyToken, restrictTo('host'), gameController.startGame);
router.post('/:gameId/end', verifyToken, restrictTo('host'), gameController.endGame);

const scoreController = require('../controllers/scoreController');

// Anyone can view status and players if they have gameId (could also restrict to connected players or host)
router.get('/:gameId/status', gameController.getGameStatus);
router.get('/:gameId/players', gameController.getConnectedPlayers);
router.get('/:gameId/scores', scoreController.getScores);
router.get('/:gameId/stats', scoreController.getStats);

// Mount rounds router
const roundsRouter = require('./rounds');
router.use('/:gameId/rounds', roundsRouter);

module.exports = router;
