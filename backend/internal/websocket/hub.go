package websocket

import (
	"log"
	"net/http"
	"os"
	"strings"
	"sync"

	"github.com/gin-gonic/gin"
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
hub  *Hub
conn *websocket.Conn
send chan []byte
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

func (h *Hub) Handler(c *gin.Context) {
conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
if err != nil {
log.Printf("WebSocket upgrade error: %v", err)
return
}

client := &Client{hub: h, conn: conn, send: make(chan []byte, 256)}
h.register(client)

go client.writePump()
go client.readPump()
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
