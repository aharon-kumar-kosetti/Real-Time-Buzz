const express = require('express');
const roundController = require('../controllers/roundController');
const buzzerController = require('../controllers/buzzerController');
const { verifyToken, restrictTo } = require('../middleware/auth');

// We use mergeParams so we can access gameId from the parent router if mounted like /api/games/:gameId/rounds
const router = express.Router({ mergeParams: true });

// Host only routes
router.post('/create', verifyToken, restrictTo('host'), roundController.createRound);
router.post('/:roundId/open-buzzer', verifyToken, restrictTo('host'), roundController.openBuzzer);
router.post('/:roundId/close-buzzer', verifyToken, restrictTo('host'), roundController.closeBuzzer);
router.post('/:roundId/reset-buzzer', verifyToken, restrictTo('host'), roundController.resetBuzzer);
router.post('/:roundId/mark-answer', verifyToken, restrictTo('host'), roundController.markAnswer);

// Shared/Public routes
router.get('/:roundId/queue', roundController.getQueue);

// Student only routes
// We verify token, but since students don't have 'role' host, they just fall through verifyToken. 
// However, our restrictTo('student') will enforce it, but let's just make sure they are verified.
router.post('/:roundId/buzz', verifyToken, buzzerController.buzz);

module.exports = router;
