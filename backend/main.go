package main

import (
	"log"
	"os"
	"time"
)

func main() {
	rdb, err := NewRedisClient()
	if err != nil {
		log.Printf("warning: %v", err)
	} else {
		defer rdb.Close()
		if err := ResetAll(rdb); err != nil {
			log.Printf("initial reset error: %v", err)
		}
		StartPeriodicReset(rdb, 24*time.Hour)
	}

	cm, err := NewCentrifugeManager(rdb)
	if err != nil {
		log.Printf("warning: failed to start centrifuge manager: %v", err)
	} else {
		defer cm.Close()
	}

	r := setupRouter(rdb, cm)

	port := os.Getenv("PORT")
	if port == "" {
		port = "5127"
	}

	log.Printf("Starting backend server on port %s", port)
	if err := r.Run(":" + port); err != nil {
		log.Fatal(err)
	}
}
