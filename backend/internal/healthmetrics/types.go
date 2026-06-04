package healthmetrics

// SyncRequest is the body for POST /api/health-metrics/sync.
// The mobile client uploads a snapshot of the patient's activity counters
// at the time of the sync (foreground polling every 5 minutes or a
// background-fetch wake every 15 minutes).
type SyncRequest struct {
	StepsToday    int     `json:"stepsToday"`
	ActiveMinutes int     `json:"activeMinutes"`
	DistanceMeters float64 `json:"distanceMeters"`
	Calories      float64 `json:"calories"`
}

// TodaySummary is the response for GET /api/health-metrics/today.
type TodaySummary struct {
	StepsToday     int     `json:"stepsToday"`
	ActiveMinutes  int     `json:"activeMinutes"`
	DistanceMeters float64 `json:"distanceMeters"`
	Calories       float64 `json:"calories"`
	LastSyncAt     string  `json:"lastSyncAt"` // RFC3339 of the most recent snapshot
}
