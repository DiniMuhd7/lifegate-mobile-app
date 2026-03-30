package websocket

import (
	"log"
	"net/http"
	"os"
	"strings"
	"sync"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin:     checkOrigin,
}

// checkOrigin validates the WebSocket request origin.
// When ALLOWED_ORIGINS is set (production), only those origins are accepted.
// Otherwise all origins are accepted (development mode).
func checkOrigin(r *http.Request) bool {
	raw := os.Getenv("ALLOWED_ORIGINS")
	if raw == "" {
		return true
	}
	origin := r.Header.Get("Origin")
	for _, allowed := range strings.Split(raw, ",") {
		if strings.TrimSpace(allowed) == origin {
			return true
		}
	}
	return false
}

type Client struct {
	hub    *Hub
	conn   *websocket.Conn
	send   chan []byte
	userID string
}

type Hub struct {
	mu      sync.RWMutex
	clients map[*Client]bool
}

func NewHub() *Hub {
	return &Hub{clients: make(map[*Client]bool)}
}

func (h *Hub) register(c *Client) {
	h.mu.Lock()
	h.clients[c] = true
	h.mu.Unlock()
}

func (h *Hub) unregister(c *Client) {
	h.mu.Lock()
	delete(h.clients, c)
	h.mu.Unlock()
	close(c.send)
}

// Broadcast sends an event to every connected client.
func (h *Hub) Broadcast(event string, data []byte) {
	msg := append([]byte(event+":"), data...)
	h.mu.RLock()
	defer h.mu.RUnlock()
	for c := range h.clients {
		select {
		case c.send <- msg:
		default:
		}
	}
}

// BroadcastToUser sends an event only to clients authenticated as the given userID.
func (h *Hub) BroadcastToUser(userID, event string, data []byte) {
	msg := append([]byte(event+":"), data...)
	h.mu.RLock()
	defer h.mu.RUnlock()
	for c := range h.clients {
		if c.userID == userID {
			select {
			case c.send <- msg:
			default:
			}
		}
	}
}

// Handler upgrades the connection. Accepts an optional `token` query parameter
// for JWT authentication; if valid the client is associated with that user.
func (h *Hub) Handler(jwtSecret string) gin.HandlerFunc {
	return func(c *gin.Context) {
		conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
		if err != nil {
			log.Printf("WebSocket upgrade error: %v", err)
			return
		}

		userID := ""
		if tokenStr := c.Query("token"); tokenStr != "" {
			type wsClaims struct {
				UserID string `json:"user_id"`
				jwt.RegisteredClaims
			}
			claims := &wsClaims{}
			tok, parseErr := jwt.ParseWithClaims(tokenStr, claims, func(t *jwt.Token) (interface{}, error) {
				return []byte(jwtSecret), nil
			}, jwt.WithValidMethods([]string{"HS256"}), jwt.WithExpirationRequired())
			if parseErr == nil && tok.Valid {
				userID = claims.UserID
			}
		}

		client := &Client{hub: h, conn: conn, send: make(chan []byte, 256), userID: userID}
		h.register(client)

		go client.writePump()
		go client.readPump()
	}
}

func (c *Client) readPump() {
	defer func() {
		c.hub.unregister(c)
		c.conn.Close()
	}()
	for {
		_, _, err := c.conn.ReadMessage()
		if err != nil {
			break
		}
	}
}

func (c *Client) writePump() {
	defer c.conn.Close()
	for msg := range c.send {
		if err := c.conn.WriteMessage(websocket.TextMessage, msg); err != nil {
			break
		}
	}
}