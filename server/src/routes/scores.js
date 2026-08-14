const express = require('express');
const scoreController = require('../controllers/scoreController');

// Mounted at /api/games/:gameId/scores (and stats could be nested or we can rename to avoid conflict, 
// wait, the spec says /api/games/{gameId}/scores and /api/games/{gameId}/stats.
// We can just create one router that handles both since they are closely related data endpoints).
const router = express.Router({ mergeParams: true });

router.get('/', scoreController.getScores);
router.get('/stats', scoreController.getStats);

module.exports = router;
