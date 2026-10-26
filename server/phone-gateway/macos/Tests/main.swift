import Foundation
// Regression tests for SdpChannel.swift (Tests/main.swift). No XCTest needed: ./test.sh compiles this file with
// SdpChannel.swift into a small runner and exits non-zero on the first failure.
// Fixtures marked "captured" come from the TECNO SPARK 20 (evidence/sdp5/hfp-probe.jsonl).

var failures = 0
var passed = 0
func check(_ name: String, _ condition: Bool) {
    if condition { passed += 1 } else { failures += 1; print("FAIL: \(name)") }
}

let l2cap = SdpElement.sequence([.uuid(0x0100)])
func rfcomm(_ channel: UInt64) -> SdpElement { .sequence([.uuid(0x0003), .uint(channel)]) }

// captured: HFP AG record, channel encoded as uint32(3)
check("captured HFP AG uint32 channel decodes to 3",
      decodeRfcommChannel(.sequence([l2cap, rfcomm(3)])) == .channel(3))
// captured: HSP AG record, uint32(2)
check("captured HSP AG uint32 channel decodes to 2",
      decodeRfcommChannel(.sequence([l2cap, rfcomm(2)])) == .channel(2))
// standard uint8 encoding (the decoder sees all widths as .uint)
check("standard uint8 channel", decodeRfcommChannel(.sequence([l2cap, rfcomm(12)])) == .channel(12))
check("highest valid channel 30", decodeRfcommChannel(.sequence([l2cap, rfcomm(30)])) == .channel(30))
// L2CAP-only service (captured AVRCP shape)
check("L2CAP-only record has no RFCOMM",
      decodeRfcommChannel(.sequence([.sequence([.uuid(0x0100), .uint(0x17)]), .sequence([.uuid(0x0017), .uint(0x0104)])])) == .noRfcomm)
check("record without ProtocolDescriptorList (e.g. Device ID) has no RFCOMM, not an error",
      decodeRfcommChannel(nil) == .noRfcomm)
check("non-sequence ProtocolDescriptorList is invalid", { if case .invalid = decodeRfcommChannel(.uint(3)) { return true }; return false }())
check("RFCOMM without channel is invalid",
      { if case .invalid = decodeRfcommChannel(.sequence([l2cap, .sequence([.uuid(0x0003)])])) { return true }; return false }())
check("RFCOMM channel that is not an integer is invalid",
      { if case .invalid = decodeRfcommChannel(.sequence([l2cap, .sequence([.uuid(0x0003), .other])])) { return true }; return false }())
check("channel 0 is invalid", { if case .invalid = decodeRfcommChannel(.sequence([l2cap, rfcomm(0)])) { return true }; return false }())
check("channel 31 is invalid", { if case .invalid = decodeRfcommChannel(.sequence([l2cap, rfcomm(31)])) { return true }; return false }())
check("huge uint32 value is invalid, not truncated",
      { if case .invalid = decodeRfcommChannel(.sequence([l2cap, rfcomm(0x0000_0103)])) { return true }; return false }())
check("two different RFCOMM channels are ambiguous",
      decodeRfcommChannel(.sequence([l2cap, rfcomm(3), rfcomm(5)])) == .ambiguous([3, 5]))
check("duplicate identical RFCOMM entries are fine",
      decodeRfcommChannel(.sequence([l2cap, rfcomm(3), rfcomm(3)])) == .channel(3))

// Service class validation (captured: the same "Handsfree Gateway" handle surfaced once with
// class 0x1203 only and once with 0x111F)
check("HFP AG class present", recordHasServiceClass(.sequence([.uuid(0x111F), .uuid(0x1203)]), 0x111F))
check("Generic-audio-only record is not HFP AG", !recordHasServiceClass(.sequence([.uuid(0x1203)]), 0x111F))
check("single UUID instead of sequence", recordHasServiceClass(.uuid(0x111F), 0x111F))
check("missing class list", !recordHasServiceClass(nil, 0x111F))

// UUID normalisation
check("16-bit UUID bytes", shortUUID(fromBytes: [0x00, 0x03]) == 0x0003)
check("32-bit UUID bytes (captured uuid32(00 00 00 03))", shortUUID(fromBytes: [0x00, 0x00, 0x00, 0x03]) == 0x0003)
check("128-bit base UUID reduces",
      shortUUID(fromBytes: [0x00, 0x00, 0x11, 0x1F, 0x00, 0x00, 0x10, 0x00, 0x80, 0x00, 0x00, 0x80, 0x5F, 0x9B, 0x34, 0xFB]) == 0x111F)
check("128-bit custom UUID does not reduce",
      shortUUID(fromBytes: [0x00, 0x00, 0x11, 0x1F, 0x00, 0x00, 0x10, 0x00, 0x80, 0x00, 0x00, 0x80, 0x5F, 0x9B, 0x34, 0xFC]) == nil)

print("SdpChannel tests: \(passed) passed, \(failures) failed")
if failures > 0 { exit(1) }
