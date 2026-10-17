package main

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
)

const (
	BoardSize   = 300
	TileSize    = 30
	TilesPerRow = BoardSize / TileSize      // 10
	TileCount   = TilesPerRow * TilesPerRow // 100
)

type Pixel struct {
	X int `json:"x"`
	Y int `json:"y"`
}

type StoredPixel struct {
	X     int    `json:"x"`
	Y     int    `json:"y"`
	Color string `json:"color"`
}

type Stroke struct {
	Color  string  `json:"color"`
	Pixels []Pixel `json:"pixels"`
}

func setupRouter(rdb *RedisClient, cm *CentrifugeManager) *gin.Engine {
	r := gin.Default()

	r.Use(corsMiddleware())

	if cm != nil {
		wsHandler := cm.WebsocketHandler()
		r.GET("/connection/websocket", gin.WrapH(wsHandler))
		r.POST("/connection/websocket", gin.WrapH(wsHandler))
	}

	// Health check
	r.GET("/health", handleHealth)
	r.GET("/api/health", handleHealth)

	// Counter
	r.GET("/counter/view", handleViewCounter(rdb))
	r.GET("/api/counter/view", handleViewCounter(rdb))

	// Canvas
	r.GET("/canvas/data/:id", handleGetCanvas(rdb))
	r.GET("/api/canvas/data/:id", handleGetCanvas(rdb))
	r.POST("/canvas/draw/:id", handleDrawCanvas(rdb))
	r.POST("/api/canvas/draw/:id", handleDrawCanvas(rdb))

	// Chat users
	r.GET("/chat/users", handleChatUsers(rdb))
	r.GET("/api/chat/users", handleChatUsers(rdb))

	// Reset
	r.POST("/api/reset", handleReset(rdb))

	return r
}

func corsMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		origin := c.Request.Header.Get("Origin")
		if origin != "" {
			c.Writer.Header().Set("Access-Control-Allow-Origin", origin)
			c.Writer.Header().Set("Access-Control-Allow-Credentials", "true")
			c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization, accept, origin, Cache-Control, X-Requested-With")
			c.Writer.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS, GET, PUT, DELETE")
		}

		if c.Request.Method == http.MethodOptions {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}

		c.Next()
	}
}

func handleHealth(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

func handleViewCounter(rdb *RedisClient) gin.HandlerFunc {
	return func(c *gin.Context) {
		if rdb == nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{"error": "redis unavailable"})
			return
		}

		count, err := rdb.Incr("viewcounter")
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusOK, count)
	}
}

func handleGetCanvas(rdb *RedisClient) gin.HandlerFunc {
	return func(c *gin.Context) {
		if rdb == nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{"error": "redis unavailable"})
			return
		}

		idStr := c.Param("id")
		id, err := strconv.Atoi(idStr)
		if err != nil || id < 0 || id >= TileCount {
			c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("invalid tile id (must be 0-%d)", TileCount-1)})
			return
		}

		data, err := rdb.HGetAll(fmt.Sprintf("canvas%d", id))
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		pixels := make([]StoredPixel, 0, len(data))
		for coord, color := range data {
			parts := strings.Split(coord, "x")
			if len(parts) != 2 {
				continue
			}
			x, errX := strconv.Atoi(parts[0])
			y, errY := strconv.Atoi(parts[1])
			if errX != nil || errY != nil {
				continue
			}
			pixels = append(pixels, StoredPixel{
				X:     x,
				Y:     y,
				Color: color,
			})
		}

		c.JSON(http.StatusOK, pixels)
	}
}

func handleDrawCanvas(rdb *RedisClient) gin.HandlerFunc {
	return func(c *gin.Context) {
		if rdb == nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{"error": "redis unavailable"})
			return
		}

		idStr := c.Param("id")
		id, err := strconv.Atoi(idStr)
		if err != nil || id < 0 || id >= TileCount {
			c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("invalid tile id (must be 0-%d)", TileCount-1)})
			return
		}

		var stroke Stroke
		if err := c.ShouldBindJSON(&stroke); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid canvas data"})
			return
		}

		if len(stroke.Pixels) == 0 {
			c.JSON(http.StatusOK, gin.H{"status": "ok"})
			return
		}

		args := make([]any, 0, len(stroke.Pixels)*2)
		for _, p := range stroke.Pixels {
			if p.X < 0 || p.X >= BoardSize || p.Y < 0 || p.Y >= BoardSize {
				continue
			}
			coord := fmt.Sprintf("%dx%d", p.X, p.Y)
			args = append(args, coord, stroke.Color)
		}

		if len(args) == 0 {
			c.JSON(http.StatusOK, gin.H{"status": "ok"})
			return
		}

		if err := rdb.HSet(fmt.Sprintf("canvas%d", id), args...); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	}
}

func handleChatUsers(rdb *RedisClient) gin.HandlerFunc {
	return func(c *gin.Context) {
		if rdb == nil {
			c.JSON(http.StatusOK, 0)
			return
		}

		exists, err := rdb.Exists("users")
		if err != nil || exists == 0 {
			c.JSON(http.StatusOK, 0)
			return
		}

		card, err := rdb.SCard("users")
		if err != nil {
			c.JSON(http.StatusOK, 0)
			return
		}

		connected := TotalChatNames - int(card)
		if connected < 0 {
			connected = 0
		}
		if connected > TotalChatNames {
			connected = TotalChatNames
		}

		c.JSON(http.StatusOK, connected)
	}
}

func handleReset(rdb *RedisClient) gin.HandlerFunc {
	return func(c *gin.Context) {
		if rdb == nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{"error": "redis unavailable"})
			return
		}

		if err := ResetAll(rdb); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusOK, gin.H{"status": "ok", "message": "reset completed"})
	}
}
