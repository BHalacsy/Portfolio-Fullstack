package main

import (
	"fmt"
	"log"
	"time"
)

// DefaultChatNames contains the 16 animal names for the chatroom name pool.
var DefaultChatNames = []string{
	"lion", "panther", "jay", "tiger", "robin",
	"giraffe", "bee", "cow", "pig", "donkey",
	"fish", "hippo", "panda", "wolf", "deer", "bear",
}

const TotalChatNames = 16

// ResetCanvas clears all canvas tiles (canvas0 through canvas[TileCount-1]).
func ResetCanvas(rdb *RedisClient) error {
	keys := make([]string, TileCount)
	for i := 0; i < TileCount; i++ {
		keys[i] = fmt.Sprintf("canvas%d", i)
	}
	return rdb.Del(keys...)
}

// ResetChatUsers clears and repopulates the available chat name pool in Redis.
func ResetChatUsers(rdb *RedisClient) error {
	_ = rdb.Del("users")

	members := make([]any, len(DefaultChatNames))
	for i, name := range DefaultChatNames {
		members[i] = name
	}
	return rdb.SAdd("users", members...)
}

// ResetAll resets both the canvas and the chat users pool.
func ResetAll(rdb *RedisClient) error {
	if err := ResetCanvas(rdb); err != nil {
		return fmt.Errorf("failed to clear canvas: %w", err)
	}
	if err := ResetChatUsers(rdb); err != nil {
		return fmt.Errorf("failed to reset chat users: %w", err)
	}
	log.Println("Reset completed: canvas cleared and chat name pool repopulated")
	return nil
}

// StartPeriodicReset starts a background ticker that runs ResetAll every interval (e.g., 24 hours).
func StartPeriodicReset(rdb *RedisClient, interval time.Duration) {
	go func() {
		ticker := time.NewTicker(interval)
		defer ticker.Stop()

		for range ticker.C {
			if err := ResetAll(rdb); err != nil {
				log.Printf("Periodic reset failed: %v", err)
			}
		}
	}()
}
