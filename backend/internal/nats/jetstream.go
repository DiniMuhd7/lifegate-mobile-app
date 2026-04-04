package nats

import (
	"errors"
	"log"

	natslib "github.com/nats-io/nats.go"
)

// Stream names — each stream is scoped to a subject wildcard group so messages
// are retained durably and can be replayed by new consumers.
const (
	StreamPatientEvents   = "PATIENT_EVENTS"   // patient.>
	StreamAIEvents        = "AI_EVENTS"         // ai.>
	StreamEarlyFlags      = "EARLY_FLAGS"        // early_flag.>
	StreamPhysicianEvents = "PHYSICIAN_EVENTS"  // physician.>
	StreamAdminEvents     = "ADMIN_EVENTS"       // admin.>
)

// streamDefs maps each stream name to the NATS subject wildcards it captures.
var streamDefs = map[string][]string{
	StreamPatientEvents:   {"patient.>"},
	StreamAIEvents:        {"ai.>"},
	StreamEarlyFlags:      {"early_flag.>"},
	StreamPhysicianEvents: {"physician.>"},
	StreamAdminEvents:     {"admin.>"},
}

// setupStreams creates or updates each JetStream stream.  It is idempotent —
// if a stream already exists with the same configuration it is left unchanged;
// if it exists with different subjects it is updated.
func setupStreams(js natslib.JetStreamContext) error {
	for name, subjects := range streamDefs {
		cfg := &natslib.StreamConfig{
			Name:      name,
			Subjects:  subjects,
			Storage:   natslib.FileStorage,  // survive NATS restarts
			Retention: natslib.LimitsPolicy, // default: keep up to MaxAge / MaxBytes
			MaxAge:    0,                    // 0 = unlimited (configure per-stream in prod)
			Replicas:  1,                    // increase to 3 for a clustered deployment
		}

		_, err := js.AddStream(cfg)
		if err == nil {
			log.Printf("[JetStream] created stream %s (%v)", name, subjects)
			continue
		}

		// Stream already exists — try to update it.
		if errors.Is(err, natslib.ErrStreamNameAlreadyInUse) || isStreamExists(err) {
			if _, updateErr := js.UpdateStream(cfg); updateErr != nil {
				log.Printf("[JetStream] stream %s already exists and could not be updated: %v", name, updateErr)
			} else {
				log.Printf("[JetStream] stream %s updated", name)
			}
			continue
		}

		return err
	}
	return nil
}

// isStreamExists checks for the string "stream name already in use" in the
// error message — the nats.go library sometimes wraps the API error as a
// plain string rather than a typed sentinel.
func isStreamExists(err error) bool {
	if err == nil {
		return false
	}
	msg := err.Error()
	return contains(msg, "already in use") || contains(msg, "stream already exists")
}

func contains(s, sub string) bool {
	return len(s) >= len(sub) && (s == sub || len(s) > 0 && findSub(s, sub))
}

func findSub(s, sub string) bool {
	for i := 0; i <= len(s)-len(sub); i++ {
		if s[i:i+len(sub)] == sub {
			return true
		}
	}
	return false
}
