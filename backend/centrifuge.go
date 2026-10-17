package main

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/centrifugal/centrifuge"
)

// Centrifuge error codes matching frontend expectations in useChat.ts
const (
	ErrCodeRoomFull         = 1001
	ErrCodePermissionDenied = 103
	ErrCodeBadRequest       = 107
	ErrCodeInternal         = 100
)

// DisconnectGracePeriod is the duration a disconnected user's name is held
// before returning it to the Redis pool, allowing quick reloads and navigation.
const DisconnectGracePeriod = 2 * time.Minute

type sessionInfo struct {
	username string
	clientID string
	timer    *time.Timer
}

// CentrifugeManager manages the Centrifuge node, WebSocket connections,
// and real-time chat and canvas pub/sub.
type CentrifugeManager struct {
	node          *centrifuge.Node
	rdb           *RedisClient
	userMu        sync.Mutex
	clientToToken map[string]string       // client.ID() -> sessionToken
	tokenSessions map[string]*sessionInfo // sessionToken -> sessionInfo
	gracePeriod   time.Duration
}

// NewCentrifugeManager initializes and starts the Centrifuge node.
func NewCentrifugeManager(rdb *RedisClient) (*CentrifugeManager, error) {
	cfg := centrifuge.Config{
		LogLevel: centrifuge.LogLevelInfo,
		LogHandler: func(entry centrifuge.LogEntry) {
			log.Printf("[centrifuge] %s: %v", entry.Message, entry.Fields)
		},
	}

	node, err := centrifuge.New(cfg)
	if err != nil {
		return nil, err
	}

	m := &CentrifugeManager{
		node:          node,
		rdb:           rdb,
		clientToToken: make(map[string]string),
		tokenSessions: make(map[string]*sessionInfo),
		gracePeriod:   DisconnectGracePeriod,
	}

	// Connection authentication (anonymous users allowed)
	node.OnConnecting(func(ctx context.Context, e centrifuge.ConnectEvent) (centrifuge.ConnectReply, error) {
		return centrifuge.ConnectReply{
			Credentials: &centrifuge.Credentials{
				UserID: e.ClientID,
			},
		}, nil
	})

	// Client connection lifecycle
	node.OnConnect(func(client *centrifuge.Client) {
		// Subscription handler
		client.OnSubscribe(func(e centrifuge.SubscribeEvent, cb centrifuge.SubscribeCallback) {
			if e.Channel == "chat" {
				if m.rdb == nil {
					cb(centrifuge.SubscribeReply{}, &centrifuge.Error{
						Code:    ErrCodeInternal,
						Message: "Chat service is currently unavailable.",
					})
					return
				}

				var subData struct {
					Token    string `json:"token"`
					Username string `json:"username"`
				}
				if len(e.Data) > 0 {
					_ = json.Unmarshal(e.Data, &subData)
				}
				sessionToken := strings.TrimSpace(subData.Token)
				if sessionToken == "" {
					sessionToken = client.ID()
				}

				m.userMu.Lock()
				sess, exists := m.tokenSessions[sessionToken]
				var username string

				if exists {
					// User reconnected within grace period! Cancel disconnect timer.
					if sess.timer != nil {
						sess.timer.Stop()
						sess.timer = nil
						log.Printf("Centrifuge: cancelled disconnect timer for user %q (session %s)", sess.username, sessionToken)
					}
					if sess.clientID != "" {
						delete(m.clientToToken, sess.clientID)
					}
					sess.clientID = client.ID()
					m.clientToToken[client.ID()] = sessionToken
					username = sess.username
					m.userMu.Unlock()
					log.Printf("Centrifuge: restored user %q for session %s (client %s)", username, sessionToken, client.ID())
				} else {
					m.userMu.Unlock()

					name, err := m.rdb.SPop("users")
					if err != nil || name == "" {
						cb(centrifuge.SubscribeReply{}, &centrifuge.Error{
							Code:    ErrCodeRoomFull,
							Message: "The chatroom is full — every name is taken. Try again later.",
						})
						return
					}
					username = name

					m.userMu.Lock()
					m.tokenSessions[sessionToken] = &sessionInfo{
						username: username,
						clientID: client.ID(),
					}
					m.clientToToken[client.ID()] = sessionToken
					m.userMu.Unlock()
					log.Printf("Centrifuge: user %q assigned to session %s (client %s)", username, sessionToken, client.ID())
				}

				data, _ := json.Marshal(map[string]string{
					"username": username,
				})

				cb(centrifuge.SubscribeReply{
					Options: centrifuge.SubscribeOptions{
						Data: data,
					},
				}, nil)
				return
			}

			if e.Channel == "canvas" {
				cb(centrifuge.SubscribeReply{}, nil)
				return
			}

			cb(centrifuge.SubscribeReply{}, nil)
		})

		// Publish handler
		client.OnPublish(func(e centrifuge.PublishEvent, cb centrifuge.PublishCallback) {
			if e.Channel == "chat" {
				m.userMu.Lock()
				sessionToken, hasToken := m.clientToToken[client.ID()]
				var username string
				if hasToken {
					if sess, ok := m.tokenSessions[sessionToken]; ok {
						username = sess.username
					}
				}
				m.userMu.Unlock()

				if username == "" {
					cb(centrifuge.PublishReply{}, &centrifuge.Error{
						Code:    ErrCodePermissionDenied,
						Message: "You need a name before you can say anything.",
					})
					return
				}

				var req struct {
					Message string `json:"message"`
				}
				if err := json.Unmarshal(e.Data, &req); err != nil || strings.TrimSpace(req.Message) == "" {
					cb(centrifuge.PublishReply{}, &centrifuge.Error{
						Code:    ErrCodeBadRequest,
						Message: "That message was rejected.",
					})
					return
				}

				timestamp := time.Now().UTC().Format("15:04:05")
				payload, err := json.Marshal(map[string]any{
					"username":  username,
					"message":   strings.TrimSpace(req.Message),
					"timestamp": timestamp,
				})
				if err != nil {
					cb(centrifuge.PublishReply{}, &centrifuge.Error{
						Code:    ErrCodeInternal,
						Message: "Failed to encode message.",
					})
					return
				}

				res, err := m.node.Publish("chat", payload)
				if err != nil {
					cb(centrifuge.PublishReply{}, err)
					return
				}

				cb(centrifuge.PublishReply{Result: &res}, nil)
				return
			}

			if e.Channel == "canvas" {
				var stroke map[string]any
				if err := json.Unmarshal(e.Data, &stroke); err == nil {
					stroke["from"] = client.ID()
					payload, err := json.Marshal(stroke)
					if err == nil {
						res, err := m.node.Publish("canvas", payload)
						if err != nil {
							cb(centrifuge.PublishReply{}, err)
							return
						}
						cb(centrifuge.PublishReply{Result: &res}, nil)
						return
					}
				}
				cb(centrifuge.PublishReply{}, &centrifuge.Error{
					Code:    ErrCodeBadRequest,
					Message: "Invalid canvas payload.",
				})
				return
			}

			cb(centrifuge.PublishReply{}, nil)
		})

		// Unsubscribe from channel (e.g. client explicitly unsubscribed)
		client.OnUnsubscribe(func(e centrifuge.UnsubscribeEvent) {
			if e.Channel == "chat" {
				m.handleDisconnect(client.ID())
			}
		})

		// Connection disconnected
		client.OnDisconnect(func(e centrifuge.DisconnectEvent) {
			m.handleDisconnect(client.ID())
		})
	})

	if err := node.Run(); err != nil {
		return nil, err
	}

	return m, nil
}

// handleDisconnect starts a grace period timer before returning the user's name to Redis.
// If the user reconnects within the grace period (e.g. page refresh or quick return),
// their session and username are preserved.
func (m *CentrifugeManager) handleDisconnect(clientID string) {
	m.userMu.Lock()
	sessionToken, hasToken := m.clientToToken[clientID]
	if !hasToken {
		m.userMu.Unlock()
		return
	}
	delete(m.clientToToken, clientID)

	sess, exists := m.tokenSessions[sessionToken]
	if !exists {
		m.userMu.Unlock()
		return
	}

	if sess.clientID == clientID {
		sess.clientID = ""
		if sess.timer != nil {
			sess.timer.Stop()
		}

		username := sess.username
		log.Printf("Centrifuge: client %s disconnected, holding user %q for session %s (grace period %v)",
			clientID, username, sessionToken, m.gracePeriod)

		sess.timer = time.AfterFunc(m.gracePeriod, func() {
			m.userMu.Lock()
			currentSess, stillExists := m.tokenSessions[sessionToken]
			if stillExists && currentSess.clientID == "" {
				delete(m.tokenSessions, sessionToken)
				m.userMu.Unlock()

				if m.rdb != nil {
					log.Printf("Centrifuge: grace period expired for session %s, returning user %q to Redis", sessionToken, username)
					if err := m.rdb.SAdd("users", username); err != nil {
						log.Printf("warning: failed to return user %q to Redis: %v", username, err)
					}
				}
				return
			}
			m.userMu.Unlock()
		})
	}
	m.userMu.Unlock()
}

// releaseUser immediately returns a client's user back into Redis (used in tests or manual resets).
func (m *CentrifugeManager) releaseUser(clientID string) {
	m.userMu.Lock()
	sessionToken, hasToken := m.clientToToken[clientID]
	if hasToken {
		delete(m.clientToToken, clientID)
		if sess, exists := m.tokenSessions[sessionToken]; exists {
			if sess.timer != nil {
				sess.timer.Stop()
			}
			username := sess.username
			delete(m.tokenSessions, sessionToken)
			m.userMu.Unlock()

			if m.rdb != nil && username != "" {
				log.Printf("Centrifuge: user %q left chat, returning to pool", username)
				if err := m.rdb.SAdd("users", username); err != nil {
					log.Printf("warning: failed to return user %q to Redis: %v", username, err)
				}
			}
			return
		}
	}
	m.userMu.Unlock()
}

// WebsocketHandler returns the HTTP handler for WebSocket connections.
func (m *CentrifugeManager) WebsocketHandler() http.Handler {
	return centrifuge.NewWebsocketHandler(m.node, centrifuge.WebsocketConfig{
		CheckOrigin: func(r *http.Request) bool {
			return true
		},
	})
}

// Close shuts down the Centrifuge node and cancels all pending session timers.
func (m *CentrifugeManager) Close() error {
	m.userMu.Lock()
	for _, sess := range m.tokenSessions {
		if sess.timer != nil {
			sess.timer.Stop()
		}
	}
	m.userMu.Unlock()

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	return m.node.Shutdown(ctx)
}
