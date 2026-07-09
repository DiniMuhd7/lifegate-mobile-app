package admin

import "golang.org/x/crypto/bcrypt"

// Service wraps the admin Repository with thin business logic.
// Currently business logic is minimal — the repository does the heavy lifting.
type Service struct {
	repo *Repository
}

func NewService(repo *Repository) *Service {
	return &Service{repo: repo}
}

func (s *Service) GetAllCases(f CaseFilters) ([]CaseRow, int, error) {
	return s.repo.GetAllCases(f)
}

func (s *Service) GetDashboardStats() (*DashboardStats, error) {
	return s.repo.GetDashboardStats()
}

func (s *Service) GetSLAReport() ([]SLAItem, error) {
	return s.repo.GetSLAReport()
}

func (s *Service) GetEDISMetrics(days int) (*EDISMetrics, error) {
	return s.repo.GetEDISMetrics(days)
}

func (s *Service) GetPhysicians() ([]PhysicianRow, error) {
	return s.repo.GetPhysicians()
}

func (s *Service) GetPhysicianDetail(id string) (*PhysicianDetail, error) {
	return s.repo.GetPhysicianDetail(id)
}

func (s *Service) CreatePhysician(inp CreatePhysicianInput) (string, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(inp.Password), bcrypt.DefaultCost)
	if err != nil {
		return "", err
	}
	return s.repo.CreatePhysician(inp, string(hash))
}

func (s *Service) UpdatePhysician(id string, inp UpdatePhysicianInput) error {
	return s.repo.UpdatePhysician(id, inp)
}

func (s *Service) DeletePhysician(id string) error {
	return s.repo.DeletePhysician(id)
}

func (s *Service) SuspendPhysician(physicianID, adminID, reason string) error {
	return s.repo.SuspendPhysician(physicianID, adminID, reason)
}

func (s *Service) UnsuspendPhysician(physicianID, adminID string) error {
	return s.repo.UnsuspendPhysician(physicianID, adminID)
}

func (s *Service) OverrideMDCN(physicianID, adminID, status string) error {
	return s.repo.OverrideMDCN(physicianID, adminID, status)
}

func (s *Service) CheckAndFlagPhysicians() (int, error) {
	return s.repo.CheckAndFlagPhysicians()
}

func (s *Service) RecordSLABreach(physicianID, caseID string, hoursOver float64) {
	_ = s.repo.RecordSLABreach(physicianID, caseID, hoursOver)
	// After recording, re-run the flag check so newly eligible physicians are flagged immediately.
	_, _ = s.repo.CheckAndFlagPhysicians()
}

func (s *Service) LogAction(adminID, action, resource string, resourceID *string, details map[string]interface{}) {
	s.repo.LogAction(adminID, action, resource, resourceID, details)
}

func (s *Service) GetSLABreachAlerts(limit int) ([]SLABreachAlert, error) {
	return s.repo.GetSLABreachAlerts(limit)
}

func (s *Service) GetReassignmentLog(page, pageSize int) ([]SLABreachAlert, int, error) {
	return s.repo.GetReassignmentLog(page, pageSize)
}

// ── Audit log ──────────────────────────────────────────────────────────────────

func (s *Service) WriteAuditEvent(actorID, actorRole, eventType, resource, resourceID string, oldVal, newVal, metadata interface{}, ipAddress string) {
	s.repo.WriteAuditEvent(actorID, actorRole, eventType, resource, resourceID, oldVal, newVal, metadata, ipAddress)
}

func (s *Service) GetAuditEvents(f AuditFilters) ([]AuditEvent, int, error) {
	return s.repo.GetAuditEvents(f)
}

func (s *Service) BuildAuditCSV(f AuditFilters) ([]byte, error) {
	return s.repo.BuildAuditCSV(f)
}

// ── Transaction log ────────────────────────────────────────────────────────────

func (s *Service) GetAllTransactions(status string, page, pageSize int) ([]AdminTransactionRow, int, error) {
	return s.repo.GetAllTransactions(status, page, pageSize)
}

func (s *Service) AdjustCredit(userID string, amount int, reason, adminID string) error {
	return s.repo.AdjustCredit(userID, amount, reason, adminID)
}

func (s *Service) BuildTransactionCSV(status string) ([]byte, error) {
	return s.repo.BuildTransactionCSV(status)
}

// ── NDPA compliance ────────────────────────────────────────────────────────────

func (s *Service) GenerateNDPASnapshot() (*NDPASnapshot, error) {
	return s.repo.GenerateNDPASnapshot()
}

func (s *Service) GetNDPASnapshots(limit int) ([]NDPASnapshot, error) {
	return s.repo.GetNDPASnapshots(limit)
}

// ── Alert thresholds ──────────────────────────────────────────────────────────

func (s *Service) GetAlertThresholds() ([]AlertThreshold, error) {
	return s.repo.GetAlertThresholds()
}

func (s *Service) UpdateAlertThreshold(adminID, key string, value float64, enabled bool) error {
	return s.repo.UpdateAlertThreshold(adminID, key, value, enabled)
}

// ── Analytics ──────────────────────────────────────────────────────────────────

func (s *Service) GetAnalytics(days int) (*AnalyticsData, error) {
	return s.repo.GetAnalytics(days)
}

// ── Patient management ────────────────────────────────────────────────────────

func (s *Service) GetPatientRegistrations(dateFrom, dateTo string, page, pageSize int) ([]PatientRegistrationRow, int, error) {
	return s.repo.GetPatientRegistrations(dateFrom, dateTo, page, pageSize)
}

func (s *Service) BuildPatientRegistrationCSV(dateFrom, dateTo string) ([]byte, error) {
	return s.repo.BuildPatientRegistrationCSV(dateFrom, dateTo)
}

func (s *Service) ParsePatientHealthCSV(csvData []byte) ([]PatientHealthImportRow, error) {
	return ParsePatientHealthCSV(csvData)
}

func (s *Service) UpdatePatientHealthData(rows []PatientHealthImportRow, adminID string) (int, []string, error) {
	return s.repo.UpdatePatientHealthData(rows, adminID)
}

func (s *Service) GetPatientHealth(patientID string) (map[string]interface{}, error) {
	return s.repo.GetPatientHealth(patientID)
}

func (s *Service) UpdatePatientHealthDirect(patientID string, data map[string]interface{}, adminID string) error {
	return s.repo.UpdatePatientHealthDirect(patientID, data, adminID)
}
