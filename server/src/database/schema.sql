-- schema.sql
-- Create necessary extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- `users` Table
CREATE TABLE IF NOT EXISTS users (
  user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL, -- 'host' or 'student'
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- `games` Table
CREATE TABLE IF NOT EXISTS games (
  game_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_code VARCHAR(10) UNIQUE NOT NULL,
  host_id UUID NOT NULL REFERENCES users(user_id),
  status VARCHAR(50) DEFAULT 'LOBBY', -- LOBBY, ACTIVE, COMPLETED
  current_round_number INT DEFAULT 0,
  presenting_house VARCHAR(20),
  correct_points INT DEFAULT 10,
  wrong_points INT DEFAULT -5,
  timeout_points INT DEFAULT -5,
  timer_duration INT DEFAULT 10, -- seconds
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  started_at TIMESTAMP,
  ended_at TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_games_host_id ON games(host_id);
CREATE INDEX IF NOT EXISTS idx_games_status ON games(status);
CREATE INDEX IF NOT EXISTS idx_games_created ON games(created_at);

-- House-specific join codes for a game
CREATE TABLE IF NOT EXISTS game_house_codes (
  game_house_code_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID NOT NULL REFERENCES games(game_id) ON DELETE CASCADE,
  house VARCHAR(20) NOT NULL,
  game_code VARCHAR(10) UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(game_id, house)
);
CREATE INDEX IF NOT EXISTS idx_game_house_codes_game_id ON game_house_codes(game_id);
CREATE INDEX IF NOT EXISTS idx_game_house_codes_code ON game_house_codes(game_code);

-- `players` Table
CREATE TABLE IF NOT EXISTS players (
  player_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID NOT NULL REFERENCES games(game_id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(user_id),
  name VARCHAR(100) NOT NULL,
  house VARCHAR(20) NOT NULL, -- PRUDHVI, AGNI, JAL, VAYU, AKASH
  player_code VARCHAR(50) NOT NULL, -- e.g., PRUDHVI-001
  session_token VARCHAR(255) UNIQUE NOT NULL,
  connected BOOLEAN DEFAULT TRUE,
  connected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_heartbeat TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(game_id, player_code)
);
CREATE INDEX IF NOT EXISTS idx_players_game_id ON players(game_id);
CREATE INDEX IF NOT EXISTS idx_players_house ON players(house);
CREATE INDEX IF NOT EXISTS idx_players_session_token ON players(session_token);
CREATE INDEX IF NOT EXISTS idx_players_game_house ON players(game_id, house);
CREATE INDEX IF NOT EXISTS idx_players_connected ON players(connected, last_heartbeat);

-- `rounds` Table
CREATE TABLE IF NOT EXISTS rounds (
  round_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID NOT NULL REFERENCES games(game_id) ON DELETE CASCADE,
  round_number INT NOT NULL,
  presenting_house VARCHAR(20) NOT NULL,
  status VARCHAR(50) DEFAULT 'ACTIVE', -- ACTIVE, COMPLETED
  current_answering_player_id UUID REFERENCES players(player_id),
  answer_start_time TIMESTAMP,
  answer_deadline TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(game_id, round_number)
);
CREATE INDEX IF NOT EXISTS idx_rounds_game_id ON rounds(game_id);
CREATE INDEX IF NOT EXISTS idx_rounds_status ON rounds(status);

-- `buzz_queue` Table (CRITICAL)
CREATE TABLE IF NOT EXISTS buzz_queue (
  queue_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id UUID NOT NULL REFERENCES rounds(round_id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES players(player_id) ON DELETE CASCADE,
  player_name VARCHAR(100) NOT NULL,
  house VARCHAR(20) NOT NULL,
  queue_position INT NOT NULL, -- 1, 2, 3, or 4
  server_timestamp BIGINT NOT NULL, -- milliseconds since epoch
  reaction_time DECIMAL(5,2), -- seconds from buzzer open to buzz
  status VARCHAR(50) DEFAULT 'WAITING', -- WAITING, ANSWERING, CORRECT, WRONG, SKIPPED
  answer_result VARCHAR(50), -- NULL, CORRECT, WRONG, TIMEOUT
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(round_id, queue_position),
  UNIQUE(round_id, player_id)
);
CREATE INDEX IF NOT EXISTS idx_buzz_queue_round_id ON buzz_queue(round_id);
CREATE INDEX IF NOT EXISTS idx_buzz_queue_player_id ON buzz_queue(player_id);
CREATE INDEX IF NOT EXISTS idx_buzz_queue_status ON buzz_queue(status);
CREATE INDEX IF NOT EXISTS idx_buzz_queue_round_server ON buzz_queue(round_id, server_timestamp);

-- `round_results` Table
CREATE TABLE IF NOT EXISTS round_results (
  result_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id UUID NOT NULL REFERENCES rounds(round_id) ON DELETE CASCADE,
  presenting_house VARCHAR(20) NOT NULL,
  correct_house VARCHAR(20), -- house that got it correct
  correct_player_id UUID REFERENCES players(player_id),
  points_awarded INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_round_results_round_id ON round_results(round_id);

-- `scores` Table
CREATE TABLE IF NOT EXISTS scores (
  score_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID NOT NULL REFERENCES games(game_id) ON DELETE CASCADE,
  house VARCHAR(20) NOT NULL,
  total_points INT DEFAULT 0,
  correct_answers INT DEFAULT 0,
  wrong_answers INT DEFAULT 0,
  total_buzzes INT DEFAULT 0,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(game_id, house)
);
CREATE INDEX IF NOT EXISTS idx_scores_game_id ON scores(game_id);
CREATE INDEX IF NOT EXISTS idx_scores_game_house ON scores(game_id, house);

-- `player_statistics` Table
CREATE TABLE IF NOT EXISTS player_statistics (
  stat_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID NOT NULL REFERENCES players(player_id) ON DELETE CASCADE,
  game_id UUID NOT NULL REFERENCES games(game_id) ON DELETE CASCADE,
  total_buzzes INT DEFAULT 0,
  first_place_buzzes INT DEFAULT 0,
  second_place_buzzes INT DEFAULT 0,
  third_place_buzzes INT DEFAULT 0,
  fourth_place_buzzes INT DEFAULT 0,
  correct_answers INT DEFAULT 0,
  wrong_answers INT DEFAULT 0,
  timeout_count INT DEFAULT 0,
  fastest_reaction_time DECIMAL(5,2),
  average_reaction_time DECIMAL(5,2),
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(player_id, game_id)
);
CREATE INDEX IF NOT EXISTS idx_player_statistics_player_id ON player_statistics(player_id);
