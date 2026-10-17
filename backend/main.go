package main

import (
	"log"
	"net/http"

	"github.com/gin-gonic/gin"
)

func main() {
	rdb, err := NewRedisClient()
	if err != nil {
		log.Printf("warning: %v", err)
	} else {
		defer rdb.Close()
	}

	r := gin.Default()

	r.GET("/api/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})

	if err := r.Run(":8080"); err != nil {
		log.Fatal(err)
	}
}
