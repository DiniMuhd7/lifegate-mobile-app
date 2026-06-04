// Package calls — ogg.go: minimal OGG/Opus container pack + unpack.
//
// PackOpus builds a valid OGG/Opus file from raw Opus RTP payloads so that
// the file can be sent to the OpenAI Whisper Speech-to-Text API.
//
// ParseOggOpus extracts the raw Opus audio packets from an OGG/Opus file
// produced by the OpenAI TTS API so they can be injected into a Pion
// TrackLocalStaticSample as individual 20 ms frames.
package calls

import (
	"bytes"
	"encoding/binary"
)

// ── OGG CRC ──────────────────────────────────────────────────────────────────

var oggCRCTable [256]uint32

func init() {
	for i := 0; i < 256; i++ {
		r := uint32(i) << 24
		for j := 0; j < 8; j++ {
			if r&0x8000_0000 != 0 {
				r = (r << 1) ^ 0x04c1_1db7
			} else {
				r <<= 1
			}
		}
		oggCRCTable[i] = r
	}
}

func oggCRC(data []byte) uint32 {
	var crc uint32
	for _, b := range data {
		crc = oggCRCTable[byte(crc>>24)^b] ^ (crc << 8)
	}
	return crc
}

// ── OGG page writer ───────────────────────────────────────────────────────────

func writeOGGPage(buf *bytes.Buffer, headerType byte, granulePos uint64, serialNo, seqNo uint32, payload []byte) {
	// Build lacing (segment table): each segment is at most 255 bytes.
	var lace []byte
	remaining := len(payload)
	if remaining == 0 {
		lace = []byte{0}
	} else {
		for remaining > 0 {
			if remaining >= 255 {
				lace = append(lace, 255)
				remaining -= 255
			} else {
				lace = append(lace, byte(remaining))
				remaining = 0
			}
		}
	}

	// Pre-allocate page buffer.
	pageSize := 27 + len(lace) + len(payload)
	page := make([]byte, pageSize)

	copy(page[0:4], "OggS")        // capture pattern
	page[4] = 0                    // stream structure version
	page[5] = headerType           // header type
	binary.LittleEndian.PutUint64(page[6:14], granulePos)
	binary.LittleEndian.PutUint32(page[14:18], serialNo)
	binary.LittleEndian.PutUint32(page[18:22], seqNo)
	// bytes 22-25: CRC (zero for now)
	page[26] = byte(len(lace))
	copy(page[27:], lace)
	copy(page[27+len(lace):], payload)

	// Compute and insert CRC.
	crc := oggCRC(page)
	binary.LittleEndian.PutUint32(page[22:26], crc)

	buf.Write(page)
}

// ── PackOpus ─────────────────────────────────────────────────────────────────

// PackOpus wraps a slice of raw Opus RTP payloads (one per 20 ms frame) into
// a minimal but valid OGG/Opus byte stream.  The result is accepted by the
// OpenAI Whisper transcription endpoint as "file.ogg".
//
// channels should be 1 (mono) or 2 (stereo).
// inputSampleRate is the original sample rate reported in the Opus ID header
// (48000 for WebRTC).
func PackOpus(packets [][]byte, channels int, inputSampleRate uint32) []byte {
	const (
		serialNo      = 0x4c4f4f50 // "LOOP" — arbitrary stream serial number
		preskip       = uint16(3840) // 80 ms at 48 kHz (common WebRTC value)
		samplesPerPkt = 960          // 20 ms at 48 kHz
	)

	var buf bytes.Buffer
	seqNo := uint32(0)

	// ── Opus Identification Header ────────────────────────────────────────
	var idHdr bytes.Buffer
	idHdr.WriteString("OpusHead")
	idHdr.WriteByte(1) // version
	idHdr.WriteByte(byte(channels))
	binary.Write(&idHdr, binary.LittleEndian, preskip)
	binary.Write(&idHdr, binary.LittleEndian, inputSampleRate)
	binary.Write(&idHdr, binary.LittleEndian, int16(0)) // output gain
	idHdr.WriteByte(0)                                  // channel mapping: simple stereo/mono

	writeOGGPage(&buf, 0x02, 0, serialNo, seqNo, idHdr.Bytes()) // BOS
	seqNo++

	// ── Opus Comment Header ───────────────────────────────────────────────
	var cmtHdr bytes.Buffer
	cmtHdr.WriteString("OpusTags")
	vendor := "lifegate-openclaw"
	binary.Write(&cmtHdr, binary.LittleEndian, uint32(len(vendor)))
	cmtHdr.WriteString(vendor)
	binary.Write(&cmtHdr, binary.LittleEndian, uint32(0)) // zero user comments

	writeOGGPage(&buf, 0x00, 0, serialNo, seqNo, cmtHdr.Bytes())
	seqNo++

	// ── Audio pages ───────────────────────────────────────────────────────
	for i, pkt := range packets {
		granule := uint64((i + 1) * samplesPerPkt)
		htype := byte(0x00)
		if i == len(packets)-1 {
			htype = 0x04 // EOS on last page
		}
		writeOGGPage(&buf, htype, granule, serialNo, seqNo, pkt)
		seqNo++
	}

	return buf.Bytes()
}

// ── ParseOggOpus ─────────────────────────────────────────────────────────────

// ParseOggOpus reads an OGG/Opus byte stream (e.g. from OpenAI TTS) and
// returns the raw Opus audio packets in order, skipping the two header pages
// (identification + comment).
//
// The returned packets can be fed directly to a Pion TrackLocalStaticSample.
func ParseOggOpus(data []byte) [][]byte {
	var packets [][]byte
	pageIdx := 0
	offset := 0

	for offset+27 <= len(data) {
		// Verify OggS capture pattern.
		if !bytes.Equal(data[offset:offset+4], []byte("OggS")) {
			// Seek to next OggS.
			next := bytes.Index(data[offset+1:], []byte("OggS"))
			if next < 0 {
				break
			}
			offset = offset + 1 + next
			continue
		}

		nSegs := int(data[offset+26])
		headerLen := 27 + nSegs
		if offset+headerLen > len(data) {
			break
		}

		// Collect segment (lace) sizes and reconstruct OGG packets.
		// A packet continues to the next segment if segment size == 255.
		dataStart := offset + headerLen
		var pkt []byte
		pos := dataStart
		for s := 0; s < nSegs; s++ {
			segSize := int(data[offset+27+s])
			if pos+segSize > len(data) {
				break
			}
			pkt = append(pkt, data[pos:pos+segSize]...)
			pos += segSize
			if segSize < 255 {
				// Packet boundary — emit.
				if pageIdx >= 2 && len(pkt) > 0 {
					out := make([]byte, len(pkt))
					copy(out, pkt)
					packets = append(packets, out)
				}
				pkt = pkt[:0]
			}
		}
		// Flush a packet that ends exactly at a page boundary (last seg == 255).
		if pageIdx >= 2 && len(pkt) > 0 {
			out := make([]byte, len(pkt))
			copy(out, pkt)
			packets = append(packets, out)
		}

		offset = pos
		pageIdx++
	}

	return packets
}
