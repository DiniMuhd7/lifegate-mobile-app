package nats

import (
	"context"
	"log"
	"time"

	natslib "github.com/nats-io/nats.go"
)

// MsgHandler is the callback type for Subscribe.
type MsgHandler func(subject string, data []byte)

// Client wraps a NATS connection and an optional JetStream context.
type Client struct {
	conn *natslib.Conn
	js   natslib.JetStreamContext
}

// Connect establishes a NATS connection with automatic reconnect, then
// initialises the JetStream context and creates all durable streams.
// If the connection fails the caller receives a no-op client — all
// Publish calls silently succeed so the rest of the application
// continues to function without NATS.
func Connect(natsURL string) *Client {
	opts := []natslib.Option{
		natslib.MaxReconnects(-1), // reconnect forever
		natslib.ReconnectWait(2 * time.Second),
		natslib.PingInterval(20 * time.Second),
		natslib.MaxPingsOutstanding(3),
		natslib.DisconnectErrHandler(func(_ *natslib.Conn, err error) {
			if err != nil {
				log.Printf("NATS disconnected: %v", err)
			}
		}),
		natslib.ReconnectHandler(func(_ *natslib.Conn) {
			log.Println("NATS reconnected")
		}),
	}

	conn, err := natslib.Connect(natsURL, opts...)
	if err != nil {
		log.Printf("Warning: Failed to connect to NATS: %v — NATS disabled", err)
		return &Client{}
	}
	log.Println("Connected to NATS")

	js, err := conn.JetStream()
	if err != nil {
		log.Printf("Warning: JetStream unavailable: %v — falling back to core NATS", err)
		return &Client{conn: conn}
	}

	if err := setupStreams(js); err != nil {
		log.Printf("Warning: JetStream stream setup error: %v — streams may be partially configured", err)
	} else {
		log.Println("NATS JetStream streams ready")
	}

	return &Client{conn: conn, js: js}
}

// IsConnected returns true when the underlying NATS connection is active.
func (c *Client) IsConnected() bool {
	return c.conn != nil && c.conn.IsConnected()
}

// Publish sends a message on core NATS (fire-and-forget).
func (c *Client) Publish(subject string, data []byte) error {
	if c.conn == nil {
		return nil
	}
	return c.conn.Publish(subject, data)
}

// PublishJS publishes a message via JetStream for at-least-once delivery.
// Falls back to core NATS when JetStream is unavailable.
func (c *Client) PublishJS(ctx context.Context, subject string, data []byte) error {
	if c.conn == nil {
		return nil
	}
	if c.js != nil {
		_, err := c.js.Publish(subject, data, natslib.Context(ctx))
		return err
	}
	return c.conn.Publish(subject, data)
}

// Subscribe registers a plain-NATS subscriber for real-time delivery.
// This is intentionally lightweight — use it for the WebSocket bridge
// where low latency matters more than durability.
func (c *Client) Subscribe(subject string, handler MsgHandler) error {
	if c.conn == nil {
		return nil
	}
	_, err := c.conn.Subscribe(subject, func(msg *natslib.Msg) {
		handler(msg.Subject, msg.Data)
	})
	return err
}

func (c *Client) Close() {
	if c.conn != nil {
		c.conn.Drain() // flush buffered messages before closing
	}
}
