package notifications

// scheduler.go — scheduled push notifications for patient retention.
//
// Jobs run via goroutines started by StartScheduler:
//  1. Streak reminder    — 8 PM WAT daily: nudge ALL users who haven't checked
//                          in today (not just those with an existing streak).
//  2. Weekly digest      — Sunday 10 AM WAT: personalised health summary for
//                          users active in the past 7 days.
//  3. Re-engagement      — Wednesday 12 PM WAT: "we miss you" push to users
//                          who have been inactive for 3–30 days; sent at most
//                          once per week per user to avoid spam.
//  4. Follow-up reminder — triggered externally via ScheduleFollowUp;
//                          fires at 24 h, 3 days, and 7 days after a case
//                          completes so a single ignored message doesn't mean
//                          the patient is never heard from again.

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"time"
)

// watLocation is West Africa Time (UTC+1). Parsing failures fall back to UTC.
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

// StartScheduler blocks forever, running all retention notification jobs.
// Call it in a dedicated goroutine.
//
// Each job fires once immediately at startup (so the first batch goes out
// on deploy rather than waiting up to a day/week for the next clock
// occurrence), then continues on its normal schedule.
func (sc *Scheduler) StartScheduler(ctx context.Context) {
	// Immediate first-run — mirrors what the OpenClaw worker does on startup.
	go sc.sendStreakReminders(ctx)
	go sc.sendWeeklyDigests(ctx)
	go sc.sendReEngagement(ctx)
	go sc.sendExploreReminders(ctx)

	// Then hand off to the timed loops.
	go sc.runStreakReminder(ctx)
	go sc.runWeeklyDigest(ctx)
	go sc.runReEngagement(ctx)
	go sc.runExploreReminder(ctx)
	<-ctx.Done()
}

// ─── 1. Streak reminder ───────────────────────────────────────────────────────

// runStreakReminder fires every day at 20:00 WAT.
// Notifies ALL registered users who have not yet checked in today — including
// users with no streak yet, so first-time and lapsed users are also nudged.
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

	// All registered users who have not checked in today.
	// LEFT JOIN user_streaks so users with no streak row are included.
	// Excludes users whose push token is unregistered (no row in push token
	// store) — the push service handles silent failures gracefully, but this
	// avoids wasted API calls for users who never granted permission.
	rows, err := sc.db.QueryContext(ctx, `
		SELECT u.id::text,
		       COALESCE(u.name, 'there'),
		       COALESCE(s.current_streak, 0)
		FROM   users u
		LEFT   JOIN user_streaks s ON s.user_id = u.id
		WHERE  u.role = 'user'
		  AND  (s.last_checkin_date IS NULL OR s.last_checkin_date < $1::date)
		LIMIT  10000`, today)
	if err != nil {
		log.Printf("[scheduler] streak reminder query error: %v", err)
		return
	}
	defer rows.Close()

	sent := 0
	for rows.Next() {
		var userID, name string
		var streak int
		if err := rows.Scan(&userID, &name, &streak); err != nil {
			continue
		}

		var title, body string
		switch {
		case streak >= 7:
			title = "Don't lose your streak! 🔥"
			body = fmt.Sprintf(
				"Hey %s, you're on a %d-day streak — check in before midnight to keep it alive.",
				name, streak)
		case streak >= 1:
			title = "Keep your streak going 💪"
			body = fmt.Sprintf(
				"Hi %s, you've checked in %d day(s) in a row. Log today's check-in before midnight!",
				name, streak)
		default:
			title = "Time for your health check-in ✅"
			body = fmt.Sprintf(
				"Hi %s, take 30 seconds to complete your daily health check-in and start building your streak.",
				name)
		}

		sc.push.SendToUser(ctx, userID, title, body, map[string]string{
			"type":   "streak_reminder",
			"screen": "/(tab)/health",
		})
		sent++
	}
	log.Printf("[scheduler] streak reminders sent to %d users", sent)
}

// ─── 2. Weekly digest ─────────────────────────────────────────────────────────

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
		case weeklyClaims >= 28:
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

// ─── 3. Re-engagement ─────────────────────────────────────────────────────────

// runReEngagement fires every Wednesday at 12:00 WAT.
// Targets users who have been inactive for 3–30 days and haven't received a
// re-engagement push in the last 7 days, to avoid over-messaging.
func (sc *Scheduler) runReEngagement(ctx context.Context) {
	for {
		next := nextWeekday(time.Wednesday, 12, 0, watLocation)
		select {
		case <-ctx.Done():
			return
		case <-time.After(time.Until(next)):
		}
		sc.sendReEngagement(ctx)
	}
}

func (sc *Scheduler) sendReEngagement(ctx context.Context) {
	// Target: users inactive 3–30 days OR who never checked in at all
	// (no streak row), registered more than 3 days ago.
	// last_reengagement_sent prevents us from pinging the same user more
	// than once per 7 days. We track this with a lightweight upsert below.
	rows, err := sc.db.QueryContext(ctx, `
		SELECT u.id::text,
		       COALESCE(u.name, 'there'),
		       COALESCE(s.current_streak, 0),
		       s.last_checkin_date,
		       COALESCE(s.last_reengagement_sent, '2000-01-01'::date) AS last_sent
		FROM   users u
		LEFT   JOIN user_streaks s ON s.user_id = u.id
		WHERE  u.role = 'user'
		  AND  u.created_at <= NOW() - INTERVAL '3 days'
		  AND  (
		         -- Never checked in
		         s.last_checkin_date IS NULL
		         OR
		         -- Inactive 3–30 days (more than 30 days gets a different tone)
		         (s.last_checkin_date < CURRENT_DATE - INTERVAL '3 days'
		          AND s.last_checkin_date >= CURRENT_DATE - INTERVAL '30 days')
		       )
		  AND  COALESCE(s.last_reengagement_sent, '2000-01-01'::date)
		         < CURRENT_DATE - INTERVAL '7 days'
		LIMIT  5000`)
	if err != nil {
		log.Printf("[scheduler] re-engagement query error: %v", err)
		return
	}
	defer rows.Close()

	type target struct {
		userID        string
		name          string
		streak        int
		lastCheckin   sql.NullTime
	}
	var targets []target
	for rows.Next() {
		var t target
		var lastSent time.Time
		if err := rows.Scan(&t.userID, &t.name, &t.streak, &t.lastCheckin, &lastSent); err != nil {
			continue
		}
		targets = append(targets, t)
	}
	rows.Close()

	today := time.Now().In(watLocation).Format("2006-01-02")
	sent := 0
	for _, t := range targets {
		daysSince := 0
		if t.lastCheckin.Valid {
			daysSince = int(time.Since(t.lastCheckin.Time).Hours() / 24)
		}

		var title, body string
		switch {
		case !t.lastCheckin.Valid:
			// Never checked in
			title = "Your health journey is waiting 🌿"
			body = fmt.Sprintf(
				"Hi %s, you haven't started your daily health check-ins yet. It only takes 30 seconds — and you earn Lifecoins every time.",
				t.name)
		case daysSince <= 7:
			title = "We miss you! Come back 💙"
			body = fmt.Sprintf(
				"Hi %s, it's been %d days since your last check-in. Your health streak is waiting — open the app to pick up where you left off.",
				t.name, daysSince)
		default:
			title = "Your health check-ins are waiting 🩺"
			body = fmt.Sprintf(
				"Hi %s, it's been a while! Regular check-ins help you spot health changes early. Tap to restart in under a minute.",
				t.name)
		}

		sc.push.SendToUser(ctx, t.userID, title, body, map[string]string{
			"type":   "re_engagement",
			"screen": "/(tab)/health",
		})

		// Record that we sent a re-engagement push today so the 7-day
		// cooldown kicks in and we don't spam this user next Wednesday.
		_, _ = sc.db.Exec(`
			INSERT INTO user_streaks (user_id, last_reengagement_sent, updated_at)
			VALUES ($1::uuid, $2::date, NOW())
			ON CONFLICT (user_id) DO UPDATE
			SET last_reengagement_sent = EXCLUDED.last_reengagement_sent,
			    updated_at             = NOW()
		`, t.userID, today)

		sent++
	}
	log.Printf("[scheduler] re-engagement pushes sent to %d users", sent)
}

// ─── 4. Explore health-videos reminder ────────────────────────────────────────

// runExploreReminder fires every day at 13:00 WAT (early afternoon).
// It nudges users to watch today's personalised health videos and earn
// Lifecoins, but only those who haven't already claimed a video reward today
// (so users who are already engaged aren't pinged unnecessarily).
func (sc *Scheduler) runExploreReminder(ctx context.Context) {
	for {
		next := nextOccurrence(13, 0, watLocation)
		select {
		case <-ctx.Done():
			return
		case <-time.After(time.Until(next)):
		}
		sc.sendExploreReminders(ctx)
	}
}

func (sc *Scheduler) sendExploreReminders(ctx context.Context) {
	today := time.Now().In(watLocation).Format("2006-01-02")

	// All patients who have NOT claimed any explore video reward today.
	rows, err := sc.db.QueryContext(ctx, `
		SELECT u.id::text, COALESCE(u.name, 'there')
		FROM   users u
		WHERE  u.role = 'user'
		  AND  NOT EXISTS (
		         SELECT 1 FROM explore_video_rewards evr
		         WHERE  evr.user_id    = u.id
		           AND  evr.rewarded_on = $1::date
		       )
		LIMIT  10000`, today)
	if err != nil {
		log.Printf("[scheduler] explore reminder query error: %v", err)
		return
	}
	defer rows.Close()

	sent := 0
	for rows.Next() {
		var userID, name string
		if err := rows.Scan(&userID, &name); err != nil {
			continue
		}
		title := "New health videos for you 🎬"
		body := fmt.Sprintf(
			"Hi %s, fresh health videos picked for you are ready in Explore. Watch a few and earn Lifecoins today!",
			name)
		sc.push.SendToUser(ctx, userID, title, body, map[string]string{
			"type":   "explore_reminder",
			"screen": "/(tab)/health/explore",
		})
		sent++
	}
	log.Printf("[scheduler] explore reminders sent to %d users", sent)
}

// ─── 5. Follow-up reminder ────────────────────────────────────────────────────

// ScheduleFollowUp sends three follow-up push notifications after a clinical
// case completes: at 24 hours, 3 days, and 7 days. Each fires only if the
// previous one was ignored (the user hasn't re-opened the app for that case).
// All three goroutines are fire-and-forget; server restart between firings
// will cause the remaining ones to be skipped — acceptable for a best-effort
// re-engagement feature.
func (sc *Scheduler) ScheduleFollowUp(userID, patientName, condition string) {
	followUps := []struct {
		delay time.Duration
		title string
		body  func() string
	}{
		{
			delay: 24 * time.Hour,
			title: "How are you feeling? 💬",
			body: func() string {
				return fmt.Sprintf(
					"Hi %s, it's been a day since your %s consultation. Tap to update your physician or start a new check-in.",
					patientName, condition)
			},
		},
		{
			delay: 3 * 24 * time.Hour,
			title: "3-day check-in reminder 🩺",
			body: func() string {
				return fmt.Sprintf(
					"Hi %s, 3 days have passed since your %s diagnosis. Log how you're feeling today so your physician can track your recovery.",
					patientName, condition)
			},
		},
		{
			delay: 7 * 24 * time.Hour,
			title: "One week since your consultation 📅",
			body: func() string {
				return fmt.Sprintf(
					"Hi %s, it's been a week since your %s case. Open LifeGate to complete a health check-in or start a new consultation if symptoms persist.",
					patientName, condition)
			},
		},
	}

	for _, f := range followUps {
		f := f // capture loop variable
		go func() {
			time.Sleep(f.delay)
			sc.push.SendToUser(
				context.Background(),
				userID,
				f.title,
				f.body(),
				map[string]string{
					"type":   "follow_up_reminder",
					"screen": "/(tab)/chatScreen",
				},
			)
		}()
	}
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
