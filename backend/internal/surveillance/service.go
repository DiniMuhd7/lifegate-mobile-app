package surveillance

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"time"
)

// NATSPublisher is a minimal interface satisfied by natsclient.Client.
type NATSPublisher interface {
	Publish(subject string, data []byte) error
}

// Service runs the surveillance background worker and exposes
// the business-logic layer to the HTTP handler.
type Service struct {
	repo *Repository
	nats NATSPublisher
}

func NewService(repo *Repository, nats NATSPublisher) *Service {
	return &Service{repo: repo, nats: nats}
}

// ─── Public read façade ───────────────────────────────────────────────────────

func (s *Service) GetSummary() (*SummaryStats, error) {
	return s.repo.GetSummary()
}

func (s *Service) GetTopConditions(weeksBack, limit int) ([]ConditionTrend, error) {
	if weeksBack < 1 || weeksBack > 52 {
		weeksBack = 12
	}
	if limit < 1 || limit > 20 {
		limit = 10
	}
	return s.repo.GetTopConditions(weeksBack, limit)
}

func (s *Service) GetByState(weeksBack int) ([]ConditionStateRow, error) {
	if weeksBack < 1 || weeksBack > 52 {
		weeksBack = 12
	}
	return s.repo.GetByState(weeksBack)
}

func (s *Service) GetActiveAnomalies() ([]Anomaly, error) {
	return s.repo.GetActiveAnomalies()
}

func (s *Service) GetSeasonalPatterns(weeksBack, topN int) (*SeasonalResponse, error) {
	if weeksBack < 4 || weeksBack > 104 {
		weeksBack = 52
	}
	if topN < 1 || topN > 15 {
		topN = 8
	}
	return s.repo.GetSeasonalPatterns(weeksBack, topN)
}

// ─── Background worker ────────────────────────────────────────────────────────

// Start launches the hourly surveillance computation loop.
// It runs the first pass immediately, then repeats every hour.
// Call it in a goroutine: go svc.Start(ctx).
func (s *Service) Start(ctx context.Context) {
	log.Println("[surveillance] worker started")
	s.runCycle()

	ticker := time.NewTicker(1 * time.Hour)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			log.Println("[surveillance] worker stopping")
			return
		case <-ticker.C:
			s.runCycle()
		}
	}
}

// runCycle aggregates the current week and the 8 historical weeks,
// then runs anomaly detection and publishes any new signals to NATS.
func (s *Service) runCycle() {
	now := time.Now().UTC()
	thisWeek := isoWeekStart(now)

	// Aggregate the current week + backfill rollingWindowWeeks historical weeks.
	// Backfill is cheap — ON CONFLICT DO UPDATE makes it idempotent.
	weeks := rollingWindowWeeks + 1
	for i := 0; i < weeks; i++ {
		week := thisWeek.AddDate(0, 0, -7*i)
		n, err := s.repo.ComputeAndUpsertWeeklyCounts(week)
		if err != nil {
			log.Printf("[surveillance] aggregate week %s: %v", week.Format("2006-01-02"), err)
		} else if n > 0 {
			log.Printf("[surveillance] upserted %d rows for week %s", n, week.Format("2006-01-02"))
		}
	}

	// Anomaly detection on the current week.
	s.detectAnomalies(thisWeek)
}

// detectAnomalies computes z-scores for the current week, persists new
// anomaly records, and publishes surveillance.anomaly.detected to NATS
// for any conditions that newly exceed the 2σ threshold.
func (s *Service) detectAnomalies(weekStart time.Time) {
	candidates, err := s.repo.GetAnomalyCandidates(weekStart)
	if err != nil {
		log.Printf("[surveillance] anomaly candidates: %v", err)
		return
	}

	newCount := 0
	for _, c := range candidates {
		isNew, err := s.repo.UpsertAnomaly(c)
		if err != nil {
			log.Printf("[surveillance] upsert anomaly %s/%s: %v", c.ConditionName, c.State, err)
			continue
		}
		if isNew {
			newCount++
		}
	}

	if newCount > 0 {
		log.Printf("[surveillance] %d new anomaly signal(s) detected for week %s",
			newCount, weekStart.Format("2006-01-02"))
	}

	// Publish NATS events for anomalies that haven't been notified yet.
	if s.nats == nil {
		return
	}
	unnotified, err := s.repo.MarkUnnotified()
	if err != nil {
		log.Printf("[surveillance] mark unnotified: %v", err)
		return
	}
	for _, a := range unnotified {
		payload, _ := json.Marshal(map[string]interface{}{
			"conditionName": a.ConditionName,
			"state":         a.State,
			"zScore":        a.ZScore,
			"severity":      a.Severity,
			"currentCount":  a.CurrentCount,
			"rollingAvg":    a.RollingAvg,
			"detectedAt":    a.DetectedAt.Format(time.RFC3339),
		})
		if err := s.nats.Publish("surveillance.anomaly.detected", payload); err != nil {
			log.Printf("[surveillance] NATS publish anomaly: %v", err)
		} else {
			log.Printf("[surveillance] published anomaly: %s in %s (z=%.2f, %s)",
				a.ConditionName, a.State, a.ZScore, a.Severity)
		}
	}
}

// ─── On-demand trigger (admin/internal use) ───────────────────────────────────

// TriggerNow runs one aggregation + anomaly detection cycle immediately.
// Intended for testing and admin-triggered refreshes.
func (s *Service) TriggerNow() error {
	now := time.Now().UTC()
	thisWeek := isoWeekStart(now)
	n, err := s.repo.ComputeAndUpsertWeeklyCounts(thisWeek)
	if err != nil {
		return fmt.Errorf("aggregate: %w", err)
	}
	log.Printf("[surveillance] trigger: upserted %d rows for week %s", n, thisWeek.Format("2006-01-02"))
	s.detectAnomalies(thisWeek)
	return nil
}
