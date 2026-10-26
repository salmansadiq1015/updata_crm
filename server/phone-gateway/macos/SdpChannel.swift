// Pure RFCOMM-channel decoding for SDP ProtocolDescriptorList (attribute 0x0004).
//
// Kept free of IOBluetooth so it can be unit-tested (see Tests/main.swift).
// Background: the TECNO SPARK 20 (Android 13) encodes the RFCOMM server channel as
// uint32 — `{ { uuid32(0100) }, { uuid32(0003), uint32(3) } }` — and macOS's
// -[IOBluetoothSDPServiceRecord getRFCOMMChannelID:] misreads that as channel 1.

enum SdpElement: Equatable {
    case uuid(UInt32)          // 16/32-bit UUID, or a 128-bit Bluetooth-base UUID reduced to its short form
    case uint(UInt64)          // unsigned integer of any width (1, 2, 4 or 8 bytes)
    case sequence([SdpElement])
    case other                 // anything else (strings, 128-bit custom UUIDs, signed ints, …)
}

enum RfcommChannelResult: Equatable {
    case channel(UInt8)
    case noRfcomm              // record has no RFCOMM protocol (e.g. AVRCP over L2CAP)
    case invalid(String)       // RFCOMM present but channel missing / not an integer / out of range
    case ambiguous([UInt64])   // several different RFCOMM channels in one record
}

let rfcommProtocolUUID: UInt32 = 0x0003

/// Decodes the RFCOMM server channel from a ProtocolDescriptorList.
/// Valid channels are 1...30 (RFCOMM server channel range).
func decodeRfcommChannel(_ protocolDescriptorList: SdpElement?) -> RfcommChannelResult {
    guard let list = protocolDescriptorList else { return .noRfcomm } // attribute-only records (e.g. Device ID)
    guard case let .sequence(protocols) = list else { return .invalid("ProtocolDescriptorList is not a sequence") }
    var channels: [UInt64] = []
    var sawRfcomm = false
    for proto in protocols {
        guard case let .sequence(parts) = proto, case let .uuid(id)? = parts.first, id == rfcommProtocolUUID else { continue }
        sawRfcomm = true
        guard parts.count >= 2, case let .uint(value) = parts[1] else { return .invalid("RFCOMM entry has no integer channel") }
        channels.append(value)
    }
    if !sawRfcomm { return .noRfcomm }
    let distinct = Array(Set(channels)).sorted()
    if distinct.count > 1 { return .ambiguous(distinct) }
    let value = distinct[0]
    guard (1...30).contains(value) else { return .invalid("RFCOMM channel \(value) outside 1...30") }
    return .channel(UInt8(value))
}

/// True when the record's ServiceClassIDList (attribute 0x0001) contains `serviceClass`.
func recordHasServiceClass(_ serviceClassIDList: SdpElement?, _ serviceClass: UInt32) -> Bool {
    switch serviceClassIDList {
    case let .sequence(items)?: return items.contains(.uuid(serviceClass))
    case let .uuid(id)?: return id == serviceClass  // some stacks put a single UUID instead of a sequence
    default: return false
    }
}

/// Reduces a 128-bit UUID on the Bluetooth base (xxxxxxxx-0000-1000-8000-00805F9B34FB) to its short form.
func shortUUID(fromBytes bytes: [UInt8]) -> UInt32? {
    switch bytes.count {
    case 2: return UInt32(bytes[0]) << 8 | UInt32(bytes[1])
    case 4: return bytes.reduce(0) { $0 << 8 | UInt32($1) }
    case 16:
        let base: [UInt8] = [0x00, 0x00, 0x10, 0x00, 0x80, 0x00, 0x00, 0x80, 0x5F, 0x9B, 0x34, 0xFB]
        guard Array(bytes[4...]) == base else { return nil }
        return bytes[0..<4].reduce(0) { $0 << 8 | UInt32($1) }
    default: return nil
    }
}
