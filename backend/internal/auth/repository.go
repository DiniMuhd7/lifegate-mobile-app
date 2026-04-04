package auth

import (
"database/sql"
"encoding/json"
"time"
)

type User struct {
ID                   string     `json:"id" db:"id"`
UserID               string     `json:"user_id" db:"user_id"`
PatientID            string     `json:"patient_id" db:"patient_id"`
Name                 string     `json:"name" db:"name"`
Email                string     `json:"email" db:"email"`
Role                 string     `json:"role" db:"role"`
Phone                string     `json:"phone,omitempty" db:"phone"`
DOB                  string     `json:"dob,omitempty" db:"dob"`
Gender               string     `json:"gender,omitempty" db:"gender"`
Language             string     `json:"language,omitempty" db:"language"`
HealthHistory        string     `json:"health_history,omitempty" db:"health_history"`
BloodType            *string    `json:"blood_type,omitempty" db:"blood_type"`
Allergies            *string    `json:"allergies,omitempty" db:"allergies"`
MedicalHistory       *string    `json:"medical_history,omitempty" db:"medical_history"`
CurrentMedications   *string    `json:"current_medications,omitempty" db:"current_medications"`
EmergencyContact     *string    `json:"emergency_contact,omitempty" db:"emergency_contact"`
Specialization       string     `json:"specialization,omitempty" db:"specialization"`
CertificateName      string     `json:"certificateName,omitempty" db:"certificate_name"`
CertificateID        string     `json:"certificateId,omitempty" db:"certificate_id"`
CertificateIssueDate string     `json:"certificateIssueDate,omitempty" db:"certificate_issue_date"`
YearsOfExperience    string     `json:"yearsOfExperience,omitempty" db:"years_of_experience"`
MdcnVerified         bool       `json:"mdcn_verified" db:"mdcn_verified"`
MdcnVerifiedAt       *time.Time `json:"mdcn_verified_at,omitempty" db:"mdcn_verified_at"`
CreatedAt            time.Time  `json:"created_at" db:"created_at"`
UpdatedAt            time.Time  `json:"updated_at" db:"updated_at"`
}

type PendingRegistration struct {
ID           string          `json:"id"`
Email        string          `json:"email"`
OTP          string          `json:"otp"`
OTPExpiresAt time.Time       `json:"otp_expires_at"`
Payload      json.RawMessage `json:"payload"`
}

type PasswordReset struct {
ID         string    `json:"id"`
Email      string    `json:"email"`
Code       string    `json:"code"`
ResetToken string    `json:"reset_token"`
ExpiresAt  time.Time `json:"expires_at"`
Used       bool      `json:"used"`
}

type Repository struct {
db *sql.DB
}

func NewRepository(db *sql.DB) *Repository {
return &Repository{db: db}
}

func (r *Repository) FindUserByEmail(email string) (*User, error) {
row := r.db.QueryRow(
`SELECT id, COALESCE(user_id,''), COALESCE(patient_id,''), name, email, role,
        COALESCE(phone,''), COALESCE(dob,''), COALESCE(gender,''), COALESCE(language,''),
        COALESCE(health_history,''), blood_type, allergies, medical_history,
        current_medications, emergency_contact, COALESCE(specialization,''),
        COALESCE(certificate_name,''), COALESCE(certificate_id,''),
        COALESCE(certificate_issue_date,''), COALESCE(years_of_experience,''),
        mdcn_verified, mdcn_verified_at, created_at, updated_at
 FROM users WHERE email = $1`, email)
return scanUser(row)
}

func (r *Repository) FindUserByID(id string) (*User, error) {
row := r.db.QueryRow(
`SELECT id, COALESCE(user_id,''), COALESCE(patient_id,''), name, email, role,
        COALESCE(phone,''), COALESCE(dob,''), COALESCE(gender,''), COALESCE(language,''),
        COALESCE(health_history,''), blood_type, allergies, medical_history,
        current_medications, emergency_contact, COALESCE(specialization,''),
        COALESCE(certificate_name,''), COALESCE(certificate_id,''),
        COALESCE(certificate_issue_date,''), COALESCE(years_of_experience,''),
        mdcn_verified, mdcn_verified_at, created_at, updated_at
 FROM users WHERE id = $1`, id)
return scanUser(row)
}

func scanUser(row *sql.Row) (*User, error) {
u := &User{}
err := row.Scan(
&u.ID, &u.UserID, &u.PatientID, &u.Name, &u.Email, &u.Role,
&u.Phone, &u.DOB, &u.Gender, &u.Language,
&u.HealthHistory, &u.BloodType, &u.Allergies, &u.MedicalHistory,
&u.CurrentMedications, &u.EmergencyContact, &u.Specialization,
&u.CertificateName, &u.CertificateID, &u.CertificateIssueDate,
&u.YearsOfExperience, &u.MdcnVerified, &u.MdcnVerifiedAt,
&u.CreatedAt, &u.UpdatedAt,
)
if err != nil {
return nil, err
}
return u, nil
}

func (r *Repository) SetMDCNVerified(userID string) (*User, error) {
now := time.Now()
row := r.db.QueryRow(
`UPDATE users
 SET mdcn_verified = TRUE, mdcn_verified_at = $2, updated_at = NOW()
 WHERE id = $1
 RETURNING id, COALESCE(user_id,''), COALESCE(patient_id,''), name, email, role,
           COALESCE(phone,''), COALESCE(dob,''), COALESCE(gender,''), COALESCE(language,''),
           COALESCE(health_history,''), blood_type, allergies, medical_history,
           current_medications, emergency_contact, COALESCE(specialization,''),
           COALESCE(certificate_name,''), COALESCE(certificate_id,''),
           COALESCE(certificate_issue_date,''), COALESCE(years_of_experience,''),
           mdcn_verified, mdcn_verified_at, created_at, updated_at`,
userID, now)
return scanUser(row)
}

func (r *Repository) GetPasswordHash(email string) (string, error) {
var hash string
err := r.db.QueryRow(`SELECT password_hash FROM users WHERE email = $1`, email).Scan(&hash)
return hash, err
}

func (r *Repository) CreateUser(u *User, passwordHash string) error {
return r.db.QueryRow(
`INSERT INTO users (user_id, patient_id, name, email, password_hash, role, phone, dob, gender, language,
                    health_history, specialization, certificate_name, certificate_id,
                    certificate_issue_date, years_of_experience)
 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
 RETURNING id, created_at, updated_at`,
u.UserID, u.PatientID, u.Name, u.Email, passwordHash, u.Role,
u.Phone, u.DOB, u.Gender, u.Language, u.HealthHistory,
u.Specialization, u.CertificateName, u.CertificateID,
u.CertificateIssueDate, u.YearsOfExperience,
).Scan(&u.ID, &u.CreatedAt, &u.UpdatedAt)
}

func (r *Repository) CreateUserWithCertURL(u *User, passwordHash, certURL string) error {
return r.db.QueryRow(
`INSERT INTO users (user_id, patient_id, name, email, password_hash, role, phone, dob, gender, language,
                    health_history, specialization, certificate_name, certificate_id,
                    certificate_issue_date, years_of_experience, certificate_url)
 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
 RETURNING id, created_at, updated_at`,
u.UserID, u.PatientID, u.Name, u.Email, passwordHash, u.Role,
u.Phone, u.DOB, u.Gender, u.Language, u.HealthHistory,
u.Specialization, u.CertificateName, u.CertificateID,
u.CertificateIssueDate, u.YearsOfExperience, certURL,
).Scan(&u.ID, &u.CreatedAt, &u.UpdatedAt)
}

func (r *Repository) UpsertPendingRegistration(email, otp string, expiresAt time.Time, payload json.RawMessage) error {
	_, err := r.db.Exec(
		`INSERT INTO pending_registrations (email, otp, otp_expires_at, payload)
 VALUES ($1, $2, $3, $4)
 ON CONFLICT (email) DO UPDATE
	   SET otp=$2, otp_expires_at=$3, payload=$4, created_at=NOW()`,
		email, otp, expiresAt, payload,
	)
	return err
}

func (r *Repository) GetPendingRegistration(email string) (*PendingRegistration, error) {
row := r.db.QueryRow(
`SELECT id, email, otp, otp_expires_at, payload
 FROM pending_registrations WHERE email = $1 ORDER BY created_at DESC LIMIT 1`, email)
pr := &PendingRegistration{}
err := row.Scan(&pr.ID, &pr.Email, &pr.OTP, &pr.OTPExpiresAt, &pr.Payload)
if err != nil {
return nil, err
}
return pr, nil
}

func (r *Repository) DeletePendingRegistration(email string) error {
_, err := r.db.Exec(`DELETE FROM pending_registrations WHERE email = $1`, email)
return err
}

func (r *Repository) CreatePasswordReset(email, code, token string, expiresAt time.Time) error {
_, err := r.db.Exec(
`INSERT INTO password_resets (email, code, reset_token, expires_at) VALUES ($1, $2, $3, $4)`,
email, code, token, expiresAt,
)
return err
}

func (r *Repository) GetValidPasswordReset(email, code string) (*PasswordReset, error) {
row := r.db.QueryRow(
`SELECT id, email, code, COALESCE(reset_token,''), expires_at, used
 FROM password_resets
 WHERE email=$1 AND code=$2 AND used=FALSE AND expires_at > NOW()
 ORDER BY created_at DESC LIMIT 1`, email, code)
pr := &PasswordReset{}
err := row.Scan(&pr.ID, &pr.Email, &pr.Code, &pr.ResetToken, &pr.ExpiresAt, &pr.Used)
if err != nil {
return nil, err
}
return pr, nil
}

// GetLatestValidPasswordReset fetches the most-recent active reset record by email only
// so the code comparison can be done in Go with constant-time equality.
func (r *Repository) GetLatestValidPasswordReset(email string) (*PasswordReset, error) {
row := r.db.QueryRow(
`SELECT id, email, code, COALESCE(reset_token,''), expires_at, used
 FROM password_resets
 WHERE email=$1 AND used=FALSE AND expires_at > NOW()
 ORDER BY created_at DESC LIMIT 1`, email)
pr := &PasswordReset{}
err := row.Scan(&pr.ID, &pr.Email, &pr.Code, &pr.ResetToken, &pr.ExpiresAt, &pr.Used)
if err != nil {
return nil, err
}
return pr, nil
}

// DeletePasswordResetsByEmail removes ALL reset records for an email.
// Called before issuing a new code (so old codes are invalidated) and after
// a successful password change (so the used token cannot be replayed).
func (r *Repository) DeletePasswordResetsByEmail(email string) error {
_, err := r.db.Exec(`DELETE FROM password_resets WHERE email = $1`, email)
return err
}

func (r *Repository) GetPasswordResetByToken(token string) (*PasswordReset, error) {
row := r.db.QueryRow(
`SELECT id, email, code, COALESCE(reset_token,''), expires_at, used
 FROM password_resets WHERE reset_token=$1 AND used=FALSE AND expires_at > NOW()
 ORDER BY created_at DESC LIMIT 1`, token)
pr := &PasswordReset{}
err := row.Scan(&pr.ID, &pr.Email, &pr.Code, &pr.ResetToken, &pr.ExpiresAt, &pr.Used)
if err != nil {
return nil, err
}
return pr, nil
}

func (r *Repository) MarkPasswordResetUsed(id string) error {
_, err := r.db.Exec(`UPDATE password_resets SET used=TRUE WHERE id=$1`, id)
return err
}

func (r *Repository) UpdatePassword(email, hash string) error {
_, err := r.db.Exec(`UPDATE users SET password_hash=$1, updated_at=NOW() WHERE email=$2`, hash, email)
return err
}

func (r *Repository) GetPasswordHashByID(userID string) (string, error) {
var hash string
err := r.db.QueryRow(`SELECT password_hash FROM users WHERE id = $1`, userID).Scan(&hash)
return hash, err
}

func (r *Repository) UpdatePasswordByID(userID, hash string) error {
_, err := r.db.Exec(`UPDATE users SET password_hash=$1, updated_at=NOW() WHERE id=$2`, hash, userID)
return err
}
