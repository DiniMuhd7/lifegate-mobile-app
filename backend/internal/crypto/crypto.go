// Package crypto provides AES-256-GCM authenticated encryption for
// protecting sensitive health data fields stored in PostgreSQL.
//
// Usage:
//
//	key := crypto.DeriveKey(os.Getenv("HEALTH_DATA_KEY"))
//	cipher, err := crypto.Encrypt([]byte(plaintext), key)
//	plain, err := crypto.Decrypt(cipher, key)
//
// The ciphertext format is:  [12-byte-nonce][GCM-ciphertext]
// encoded as URL-safe base64 (no padding) so it is safe to store in TEXT columns.
package crypto

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"io"
)

var ErrShortKey = errors.New("crypto: key must be exactly 32 bytes (AES-256)")

// DeriveKey deterministically derives a 32-byte AES-256 key from any string
// secret using SHA-256.  Use a dedicated HEALTH_DATA_KEY env var in production.
func DeriveKey(secret string) []byte {
	h := sha256.Sum256([]byte(secret))
	return h[:]
}

// Encrypt encrypts plaintext using AES-256-GCM with a random 12-byte nonce.
// The returned string is URL-safe base64 (nonce || ciphertext).
func Encrypt(plaintext []byte, key []byte) (string, error) {
	if len(key) != 32 {
		return "", ErrShortKey
	}

	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}

	nonce := make([]byte, gcm.NonceSize()) // 12 bytes for GCM
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", err
	}

	sealed := gcm.Seal(nonce, nonce, plaintext, nil)
	return base64.RawURLEncoding.EncodeToString(sealed), nil
}

// Decrypt decodes and decrypts an AES-256-GCM ciphertext produced by Encrypt.
func Decrypt(ciphertext string, key []byte) ([]byte, error) {
	if len(key) != 32 {
		return nil, ErrShortKey
	}

	raw, err := base64.RawURLEncoding.DecodeString(ciphertext)
	if err != nil {
		return nil, err
	}

	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}

	nonceSize := gcm.NonceSize()
	if len(raw) < nonceSize {
		return nil, errors.New("crypto: ciphertext too short")
	}

	nonce, ct := raw[:nonceSize], raw[nonceSize:]
	return gcm.Open(nil, nonce, ct, nil)
}

// EncryptString is a convenience wrapper for string health-data fields.
func EncryptString(plaintext string, key []byte) (string, error) {
	if plaintext == "" {
		return "", nil
	}
	return Encrypt([]byte(plaintext), key)
}

// DecryptString is a convenience wrapper that returns an empty string if
// the input is empty (indicating the field was not stored encrypted).
func DecryptString(ciphertext string, key []byte) (string, error) {
	if ciphertext == "" {
		return "", nil
	}
	// Graceful fallback: if DecodeString fails it may be unencrypted legacy data.
	b, err := Decrypt(ciphertext, key)
	if err != nil {
		// Return the raw value so read never breaks existing plaintext rows.
		return ciphertext, nil
	}
	return string(b), nil
}
