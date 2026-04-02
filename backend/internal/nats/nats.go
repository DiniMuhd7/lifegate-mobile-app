package nats

import (
	"log"
	"time"

	natslib "github.com/nats-io/nats.go"
)

type Client struct {
	conn *natslib.Conn
}

// Connect establishes a NATS connection with automatic reconnect.
// If the connection fails the caller receives a no-op client — all
// Publish calls silently succeed so the rest of the application continues
// to function without NATS.
func Connect(natsURL string) *Client {
	opts := []natslib.Option{
		natslib.MaxReconnects(-1),                      // reconnect forever
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
	return &Client{conn: conn}
}

// IsConnected returns true when the underlying NATS connection is active.
func (c *Client) IsConnected() bool {
	return c.conn != nil && c.conn.IsConnected()
}

func (c *Client) Publish(subject string, data []byte) error {
	if c.conn == nil {
		return nil
	}
	return c.conn.Publish(subject, data)
}

func (c *Client) Close() {
	if c.conn != nil {
		c.conn.Drain() // flush buffered messages before closing
	}
}
