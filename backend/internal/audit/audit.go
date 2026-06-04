// Package audit provides a thin helper to write structured audit events via
// the admin service without creating import cycles.
// The middleware attaches the audit writer to the Gin context so any handler
// can call audit.Log(c, ...) without depending on the admin package directly.
package audit

import (
	"context"
)

// Writer is satisfied by admin.Service — the admin package registers a concrete
// implementation at server startup.
type Writer interface {
	WriteAuditEvent(actorID, actorRole, eventType, resource, resourceID string,
		oldVal, newVal, metadata interface{}, ipAddress string)
}

// ctxKey is the context key used to carry the Writer.
type ctxKey struct{}

// NewContext returns a new context with the Writer attached.
func NewContext(ctx context.Context, w Writer) context.Context {
	return context.WithValue(ctx, ctxKey{}, w)
}

// FromContext retrieves the Writer from a context (nil if not set).
func FromContext(ctx context.Context) Writer {
	w, _ := ctx.Value(ctxKey{}).(Writer)
	return w
}

// Log writes an audit event, silently ignoring a nil writer.
func Log(ctx context.Context, actorID, actorRole, eventType, resource, resourceID string,
	oldVal, newVal, metadata interface{}, ipAddress string) {
	w := FromContext(ctx)
	if w == nil {
		return
	}
	w.WriteAuditEvent(actorID, actorRole, eventType, resource, resourceID,
		oldVal, newVal, metadata, ipAddress)
}
