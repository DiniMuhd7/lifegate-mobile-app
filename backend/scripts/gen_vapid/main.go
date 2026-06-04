// gen_vapid generates a VAPID key pair and prints the values to add to your
// environment / .env file. Run once and store the keys securely:
//
//	go run ./scripts/gen_vapid/main.go
package main

import (
	"fmt"
	"log"

	webpush "github.com/SherClockHolmes/webpush-go"
)

func main() {
	privateKey, publicKey, err := webpush.GenerateVAPIDKeys()
	if err != nil {
		log.Fatalf("failed to generate VAPID keys: %v", err)
	}

	fmt.Println("# Add these to your .env / Render environment variables:")
	fmt.Printf("VAPID_PUBLIC_KEY=%s\n", publicKey)
	fmt.Printf("VAPID_PRIVATE_KEY=%s\n", privateKey)
	fmt.Println(`VAPID_SUBJECT=mailto:contact@dshub.com.ng`)
}
