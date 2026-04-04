package websocket

import (
	"encoding/json"
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

// clientMsg is the JSON shape a connected client may send to the hub.
// action: "subscribe" | "unsubscribe"
// events: list of event names the client wants to receive or stop receiving.
type clientMsg struct {
	Action string   `json:"action"`
	Events []string `json:"events"`
}

// Client represents a single WebSocket connection.
type Client struct {
	hub    *Hub
	conn   *websocket.Conn
	send   chan []byte
	userID string
	role   string // "user" | "professional" | "admin"
	mu     sync.RWMutex
	subs   map[string]bool // set of event names this client subscribes to
}

// isSubscribed returns true when the client has subscribed to the given event,
// or has no explicit subscriptions at all (receives everything).
func (c *Client) isSubscribed(event string) bool {
	c.mu.RLock()
	defer c.mu.RUnlock()
	if len(c.subs) == 0 {
		return true
	}
	return c.subs[event]
}

// Hub manages all active WebSocket connections.
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

// Broadcast sends an event to every connected client that subscribes to it.
func (h *Hub) Broadcast(event string, data []byte) {
	msg := append([]byte(event+":"), data...)
	h.mu.RLock()
	defer h.mu.RUnlock()
	for c := range h.clients {
		if !c.isSubscribed(event) {
			continue
		}
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
		if c.userID == userID && c.isSubscribed(event) {
			select {
			case c.send <- msg:
			default:
			}
		}
	}
}

// BroadcastToRole sends an event to all clients with the given role.
// role matches the "role" JWT claim ("user", "professional", "admin").
func (h *Hub) BroadcastToRole(role, event string, data []byte) {
	msg := append([]byte(event+":"), data...)
	h.mu.RLock()
	defer h.mu.RUnlock()
	for c := range h.clients {
		if c.role == role && c.isSubscribed(event) {
			select {
			case c.send <- msg:
			default:
			}
		}
	}
}

// Handler upgrades the HTTP connection to WebSocket. Accepts an optional
// `token` query parameter for JWT authentication; if valid the client is
// associated with that userID and role.
//
// After connecting, clients may send subscription control frames:
//
//	{"action":"subscribe",   "events":["diagnosis.update"]}
//	{"action":"unsubscribe", "events":["diagnosis.update"]}
func (h *Hub) Handler(jwtSecret string) gin.HandlerFunc {
	return func(c *gin.Context) {
		conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
		if err != nil {
			log.Printf("WebSocket upgrade error: %v", err)
			return
		}

		userID := ""
		role := ""
		if tokenStr := c.Query("token"); tokenStr != "" {
			type wsClaims struct {
				UserID string `json:"user_id"`
				Role   string `json:"role"`
				jwt.RegisteredClaims
			}
			claims := &wsClaims{}
			tok, parseErr := jwt.ParseWithClaims(tokenStr, claims, func(t *jwt.Token) (interface{}, error) {
				return []byte(jwtSecret), nil
			}, jwt.WithValidMethods([]string{"HS256"}), jwt.WithExpirationRequired())
			if parseErr == nil && tok.Valid {
				userID = claims.UserID
				role = claims.Role
			}
		}

		client := &Client{
			hub:    h,
			conn:   conn,
			send:   make(chan []byte, 256),
			userID: userID,
			role:   role,
			subs:   make(map[string]bool),
		}
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
		_, raw, err := c.conn.ReadMessage()
		if err != nil {
			break
		}
		// Handle subscription control messages.
		var msg clientMsg
		if jsonErr := json.Unmarshal(raw, &msg); jsonErr != nil {
			continue
		}
		c.mu.Lock()
		switch msg.Action {
		case "subscribe":
			for _, ev := range msg.Events {
				c.subs[ev] = true
			}
		case "unsubscribe":
			for _, ev := range msg.Events {
				delete(c.subs, ev)
			}
		}
		c.mu.Unlock()
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
