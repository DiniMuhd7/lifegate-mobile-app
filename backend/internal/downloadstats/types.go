package downloadstats

// EventType values accepted by the tracking endpoint.
const (
	EventView            = "view"
	EventAndroidDownload = "android_download"
	EventIOSDownload     = "ios_download"
)

// TrackEventRequest is the request body for POST /api/download-stats/events.
type TrackEventRequest struct {
	Event string `json:"event" binding:"required"`
}

// Stats is the aggregated public download metrics snapshot.
type Stats struct {
	PageViews     int64  `json:"pageViews"`
	AndroidClicks int64  `json:"androidClicks"`
	IOSClicks     int64  `json:"iosClicks"`
	UpdatedAt     string `json:"updatedAt"`
}
