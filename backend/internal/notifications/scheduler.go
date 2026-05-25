package notifications

// scheduler.go — scheduled push notifications for patient retention.
//
// Three jobs run via goroutines started by StartScheduler:
//  1. Streak reminder  — 8 PM WAT daily: nudge users who haven't checked in today
//  2. Weekly digest    — Sunday 10 AM WAT: personalised health summary
//  3. Orphan job       — started externally via ScheduleFollowUp

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"time"
)

// watLocation is West Africa Time (UTC+1).  Parsing failures fall back to UTC.
var watLocation = func() *time.Location {
	if loc, err := time.LoadLocation("Africa/Lagos"); err == nil {
		return loc
	}
	return time.UTC
}()

// Scheduler drives periodic push notifications.
type Scheduler struct {
	db   *sql.DB
	push *Service
}

// NewScheduler creates a Scheduler.
func NewScheduler(db *sql.DB, push *Service) *Scheduler {
	return &Scheduler{db: db, push: push}
}

// StartScheduler blocks forever, running streak reminders and weekly digests.
// Call it in a dedicated goroutine: go notifications.NewScheduler(db, push).StartScheduler(ctx).
func (sc *Scheduler) StartScheduler(ctx context.Context) {
	go sc.runStreakReminder(ctx)
	go sc.runWeeklyDigest(ctx)
	<-ctx.Done()
}

// ─── Streak reminder ──────────────────────────────────────────────────────────

// runStreakReminder fires every day at 20:00 WAT.
// It notifies every registered user who has NOT yet checked in today AND
// has a streak of at least 1 (to protect their existing streak) OR whose last
// check-in was yesterday (so today is a fresh opportunity).
func (sc *Scheduler) runStreakReminder(ctx context.Context) {
	for {
		next := nextOccurrence(20, 0, watLocation)
		select {
		case <-ctx.Done():
			return
		case <-time.After(time.Until(next)):
		}
		sc.sendStreakReminders(ctx)
	}
}

func (sc *Scheduler) sendStreakReminders(ctx context.Context) {
	today := time.Now().In(watLocation).Format("2006-01-02")

	// Users who have a streak > 0 but haven't checked in today.
	rows, err := sc.db.QueryContext(ctx, `
		SELECT s.user_id::text, s.current_streak, COALESCE(u.name, 'there')
		FROM   user_streaks s
		JOIN   users u ON u.id = s.user_id
		WHERE  (s.last_checkin_date IS NULL OR s.last_checkin_date < $1::date)
		  AND  s.current_streak >= 1
		LIMIT  5000`, today)
	if err != nil {
		log.Printf("[scheduler] streak reminder query error: %v", err)
		return
	}
	defer rows.Close()

	sent := 0
	for rows.Next() {
		var userID, name string
		var streak int
		if err := rows.Scan(&userID, &streak, &name); err != nil {
			continue
		}
		title := "Don't lose your streak! 🔥"
		body := fmt.Sprintf(
			"Hey %s, you're on a %d-day streak. Check in before midnight to keep it going.",
			name, streak)
		sc.push.SendToUser(ctx, userID, title, body, map[string]string{
			"type":   "streak_reminder",
			"screen": "/(tab)/health",
		})
		sent++
	}
	log.Printf("[scheduler] streak reminders sent to %d users", sent)
}

// ─── Weekly digest ────────────────────────────────────────────────────────────

// runWeeklyDigest fires every Sunday at 10:00 WAT.
func (sc *Scheduler) runWeeklyDigest(ctx context.Context) {
	for {
		next := nextWeekday(time.Sunday, 10, 0, watLocation)
		select {
		case <-ctx.Done():
			return
		case <-time.After(time.Until(next)):
		}
		sc.sendWeeklyDigests(ctx)
	}
}

func (sc *Scheduler) sendWeeklyDigests(ctx context.Context) {
	// Gather users who had at least one check-in in the past 7 days.
	rows, err := sc.db.QueryContext(ctx, `
		SELECT DISTINCT s.user_id::text, COALESCE(u.name, 'there'),
		       s.current_streak,
		       (SELECT COUNT(*) FROM checkin_claims c
		        WHERE  c.user_id = s.user_id
		          AND  c.claim_date >= CURRENT_DATE - INTERVAL '7 days') AS weekly_claims
		FROM   user_streaks s
		JOIN   users u ON u.id = s.user_id
		WHERE  s.last_checkin_date >= CURRENT_DATE - INTERVAL '7 days'
		LIMIT  5000`)
	if err != nil {
		log.Printf("[scheduler] weekly digest query error: %v", err)
		return
	}
	defer rows.Close()

	sent := 0
	for rows.Next() {
		var userID, name string
		var streak, weeklyClaims int
		if err := rows.Scan(&userID, &name, &streak, &weeklyClaims); err != nil {
			continue
		}

		title := "Your weekly health report is ready 📊"
		var body string
		switch {
		case weeklyClaims >= 28: // 4 slots × 7 days
			body = fmt.Sprintf("Incredible week, %s! You completed every check-in (%d/28). Your %d-day streak is outstanding.", name, weeklyClaims, streak)
		case weeklyClaims >= 14:
			body = fmt.Sprintf("Great job, %s! %d check-ins this week. Keep your %d-day streak going — open the app to see your summary.", name, weeklyClaims, streak)
		default:
			body = fmt.Sprintf("Hi %s, you checked in %d times last week. Small steps count — tap to see your health trends.", name, weeklyClaims)
		}

		sc.push.SendToUser(ctx, userID, title, body, map[string]string{
			"type":   "weekly_digest",
			"screen": "/(tab)/health",
		})
		sent++
	}
	log.Printf("[scheduler] weekly digests sent to %d users", sent)
}

// ─── Follow-up reminder ───────────────────────────────────────────────────────

// ScheduleFollowUp sends a follow-up push notification to the patient
// ~24 hours after a clinical session ends. Call this after a diagnosis is
// marked Complete or a physician posts a review decision.
func (sc *Scheduler) ScheduleFollowUp(userID, patientName, condition string) {
	go func() {
		select {
		case <-time.After(24 * time.Hour):
		}
		sc.push.SendToUser(
			context.Background(),
			userID,
			"How are you feeling? 💬",
			fmt.Sprintf(
				"Hi %s, it's been a day since your %s consultation. Tap to update your physician or start a new check-in.",
				patientName, condition),
			map[string]string{
				"type":   "follow_up_reminder",
				"screen": "/(tab)/chatScreen",
			},
		)
	}()
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// nextOccurrence returns the next wall-clock time at hour:minute in loc,
// advancing to tomorrow if that moment has already passed today.
func nextOccurrence(hour, minute int, loc *time.Location) time.Time {
	now := time.Now().In(loc)
	t := time.Date(now.Year(), now.Month(), now.Day(), hour, minute, 0, 0, loc)
	if !t.After(now) {
		t = t.Add(24 * time.Hour)
	}
	return t
}

// nextWeekday returns the next occurrence of the given weekday at hour:minute.
func nextWeekday(weekday time.Weekday, hour, minute int, loc *time.Location) time.Time {
	now := time.Now().In(loc)
	t := time.Date(now.Year(), now.Month(), now.Day(), hour, minute, 0, 0, loc)
	daysUntil := int(weekday - now.Weekday())
	if daysUntil < 0 {
		daysUntil += 7
	}
	if daysUntil == 0 && !t.After(now) {
		daysUntil = 7
	}
	return t.AddDate(0, 0, daysUntil)
}
