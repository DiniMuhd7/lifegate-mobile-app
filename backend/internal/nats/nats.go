package nats

import (
"log"

"github.com/nats-io/nats.go"
)

type Client struct {
conn *nats.Conn
}

func Connect(natsURL string) *Client {
conn, err := nats.Connect(natsURL)
if err != nil {
log.Printf("Warning: Failed to connect to NATS: %v — NATS disabled", err)
return &Client{}
}
log.Println("Connected to NATS")
return &Client{conn: conn}
}

func (c *Client) Publish(subject string, data []byte) error {
if c.conn == nil {
return nil
}
return c.conn.Publish(subject, data)
}

func (c *Client) Close() {
if c.conn != nil {
c.conn.Close()
}
}
