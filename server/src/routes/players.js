const express = require('express');
const playerController = require('../controllers/playerController');
const { verifyToken } = require('../middleware/auth');

const router = express.Router();

router.post('/join', playerController.joinGame);

// Requires student to be authenticated via their JWT (provided during join)
router.post('/:playerId/heartbeat', verifyToken, playerController.heartbeat);

module.exports = router;
