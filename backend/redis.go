package main

import (
	"context"
	"fmt"
	"os"
	"time"

	"github.com/redis/go-redis/v9"
)

// RedisClient wraps go-redis and manages connection lifecycle and common commands.
type RedisClient struct {
	client *redis.Client
	ctx    context.Context
}

// RedisOptions holds configuration options for the Redis client.
type RedisOptions struct {
	Addr     string        // Host:Port (e.g., "127.0.0.1:6379"). Defaults to REDIS_ADDR env or "127.0.0.1:6379".
	Password string        // Password if required, otherwise empty.
	DB       int           // Database number, default 0.
	Timeout  time.Duration // Ping timeout on init, default 3s.
}

// NewRedisClient creates a new RedisClient, connects immediately, and verifies the connection with Ping.
func NewRedisClient(opts ...RedisOptions) (*RedisClient, error) {
	cfg := RedisOptions{
		Addr:    "127.0.0.1:6379",
		Timeout: 3 * time.Second,
	}

	if envAddr := os.Getenv("REDIS_ADDR"); envAddr != "" {
		cfg.Addr = envAddr
	}

	if len(opts) > 0 {
		if opts[0].Addr != "" {
			cfg.Addr = opts[0].Addr
		}
		cfg.Password = opts[0].Password
		cfg.DB = opts[0].DB
		if opts[0].Timeout > 0 {
			cfg.Timeout = opts[0].Timeout
		}
	}

	rdb := redis.NewClient(&redis.Options{
		Addr:     cfg.Addr,
		Password: cfg.Password,
		DB:       cfg.DB,
	})

	ctx, cancel := context.WithTimeout(context.Background(), cfg.Timeout)
	defer cancel()

	if err := rdb.Ping(ctx).Err(); err != nil {
		_ = rdb.Close()
		return nil, fmt.Errorf("failed to connect to redis at %s: %w", cfg.Addr, err)
	}

	return &RedisClient{
		client: rdb,
		ctx:    context.Background(),
	}, nil
}

// WithContext returns a shallow copy of RedisClient that uses the provided context.
func (r *RedisClient) WithContext(ctx context.Context) *RedisClient {
	return &RedisClient{
		client: r.client,
		ctx:    ctx,
	}
}

// Raw returns the underlying *redis.Client for unmapped commands.
func (r *RedisClient) Raw() *redis.Client {
	return r.client
}

// Ping verifies connectivity to Redis.
func (r *RedisClient) Ping() error {
	return r.client.Ping(r.ctx).Err()
}

// Get fetches the string value for key. Returns redis.Nil error if key does not exist.
func (r *RedisClient) Get(key string) (string, error) {
	return r.client.Get(r.ctx, key).Result()
}

// Set stores a key-value pair with an expiration (use 0 for no expiration).
func (r *RedisClient) Set(key string, value any, expiration time.Duration) error {
	return r.client.Set(r.ctx, key, value, expiration).Err()
}

// Del deletes one or more keys.
func (r *RedisClient) Del(keys ...string) error {
	return r.client.Del(r.ctx, keys...).Err()
}

// Incr increments the integer value of a key by 1 and returns the new value.
func (r *RedisClient) Incr(key string) (int64, error) {
	return r.client.Incr(r.ctx, key).Result()
}

// HGet retrieves a specific field from a hash.
func (r *RedisClient) HGet(key, field string) (string, error) {
	return r.client.HGet(r.ctx, key, field).Result()
}

// HSet sets field-value pairs in a hash.
func (r *RedisClient) HSet(key string, values ...any) error {
	return r.client.HSet(r.ctx, key, values...).Err()
}

// HGetAll returns all fields and values from a hash.
func (r *RedisClient) HGetAll(key string) (map[string]string, error) {
	return r.client.HGetAll(r.ctx, key).Result()
}

// SAdd adds one or more members to a set.
func (r *RedisClient) SAdd(key string, members ...any) error {
	return r.client.SAdd(r.ctx, key, members...).Err()
}

// SPop removes and returns a random member from a set.
func (r *RedisClient) SPop(key string) (string, error) {
	return r.client.SPop(r.ctx, key).Result()
}

// Close closes the Redis connection pool.
func (r *RedisClient) Close() error {
	return r.client.Close()
}
