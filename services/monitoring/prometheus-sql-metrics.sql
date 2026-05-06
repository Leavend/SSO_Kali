-- PostgreSQL Queries for CPU Optimization Monitoring
-- Run these against the SSO backend Postgres database

-- 1. Check token generation rate (JWT operations indicator)
SELECT
    DATE_TRUNC('hour', created_at) AS hour,
    COUNT(*) AS tokens_issued,
    COUNT(*) / GREATEST(COUNT(*) OVER(), 1) AS rate_normalized
FROM access_tokens
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY hour
ORDER BY hour DESC
LIMIT 24;

-- 2. Check cache hit ratio from application logs (if logged)
SELECT
    metric_name,
    COUNT(*) AS occurrences,
    AVG(value) AS avg_value
FROM performance_metrics
WHERE metric_name IN ('cache_hit', 'cache_miss')
  AND created_at > NOW() - INTERVAL '1 hour'
GROUP BY metric_name;

-- 3. Queue job processing throughput
SELECT
    DATE_TRUNC('minute', reserved_at) AS minute,
    COUNT(*) AS jobs_processed,
    AVG(EXTRACT(EPOCH FROM (finished_at - reserved_at))) AS avg_duration_seconds
FROM jobs
WHERE reserved_at > NOW() - INTERVAL '1 hour'
  AND finished_at IS NOT NULL
GROUP BY minute
ORDER BY minute DESC
LIMIT 60;

-- 4. Database query performance impact
SELECT
    query,
    COUNT(*) AS execution_count,
    AVG(execution_time_ms) AS avg_time_ms,
    SUM(execution_time_ms) AS total_time_ms
FROM pg_stat_statements
WHERE queries > 0
GROUP BY query
ORDER BY total_time_ms DESC
LIMIT 10;

-- 5. Session activity rate (proxy for OAuth flow load)
SELECT
    DATE_TRUNC('10 minutes', created_at) AS period,
    COUNT(DISTINCT session_id) AS active_sessions,
    COUNT(*) AS session_events
FROM session_events
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY period
ORDER BY period DESC
LIMIT 144;

-- 6. Back-channel logout queue backlog
SELECT
    queue,
    COUNT(*) AS pending_jobs,
    MAX(reserved_at) AS oldest_job_time,
    EXTRACT(EPOCH FROM (NOW() - MAX(reserved_at))) / 60 AS age_minutes
FROM jobs
WHERE reserved_at IS NULL
  AND queue = 'backchannel-logout'
GROUP BY queue;

-- 7. Memory usage monitoring (Postgres)
SELECT
    datname,
    pg_size_pretty(pg_database_size(datname)) AS size
FROM pg_database
WHERE datname = current_database();

-- 8. Connection pool utilization
SELECT
    state,
    COUNT(*) AS connections
FROM pg_stat_activity
WHERE datname = current_database()
GROUP BY state;
