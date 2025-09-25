-- Security features database migration
-- Creates tables for security logging and monitoring

-- Create security logs table
CREATE TABLE IF NOT EXISTS ggr_security_logs (
  id SERIAL PRIMARY KEY,
  event_type VARCHAR(50) NOT NULL,
  user_id INTEGER REFERENCES ggr_users(id) ON DELETE SET NULL,
  username VARCHAR(255),
  ip_address VARCHAR(45) NOT NULL,
  user_agent TEXT,
  path VARCHAR(1000),
  details JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Indexes for performance
  INDEX idx_security_logs_event_type (event_type),
  INDEX idx_security_logs_user_id (user_id),
  INDEX idx_security_logs_ip (ip_address),
  INDEX idx_security_logs_created_at (created_at),
  INDEX idx_security_logs_details_gin (details) USING GIN
);

-- Create settings table if it doesn't exist (for security settings)
CREATE TABLE IF NOT EXISTS ggr_settings (
  id SERIAL PRIMARY KEY,
  setting_key VARCHAR(255) NOT NULL UNIQUE,
  setting_value JSONB NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Index for fast lookups
  INDEX idx_settings_key (setting_key)
);

-- Insert default security settings
INSERT INTO ggr_settings (setting_key, setting_value, description)
VALUES (
  'security_404_limit',
  '{
    "enabled": true,
    "maxAttempts": 5,
    "timeWindow": 300,
    "logoutUser": true,
    "notifyAdmin": true
  }',
  'Security settings for 404 attempt limiting and monitoring'
) ON CONFLICT (setting_key) DO NOTHING;

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger for settings table
DROP TRIGGER IF EXISTS update_settings_updated_at ON ggr_settings;
CREATE TRIGGER update_settings_updated_at
    BEFORE UPDATE ON ggr_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Create view for recent security events (useful for admin dashboard)
CREATE OR REPLACE VIEW ggr_recent_security_events AS
SELECT
  id,
  event_type,
  username,
  ip_address,
  path,
  details,
  created_at,
  CASE
    WHEN event_type = 'security_violation' THEN 'high'
    WHEN event_type = '404_attempt' AND (details->>'attemptCount')::int > 3 THEN 'medium'
    ELSE 'low'
  END as severity
FROM ggr_security_logs
WHERE created_at >= NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC;

-- Grant permissions (adjust as needed for your setup)
-- GRANT SELECT, INSERT, UPDATE ON ggr_security_logs TO your_app_user;
-- GRANT SELECT, INSERT, UPDATE ON ggr_settings TO your_app_user;
-- GRANT SELECT ON ggr_recent_security_events TO your_app_user;