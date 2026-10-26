// Updata paired-phone gateway — Phase 1 proof of concept (macOS).
//
// Uses only public macOS APIs: IOBluetooth's IOBluetoothHandsFreeDevice (the Mac
// acts as the hands-free unit of a paired phone) and CoreAudio/AVAudioEngine for
// the SCO audio device that macOS exposes while the hands-free audio link is open.
//
// Every step is written as one JSON line (stdout + --log file) so the run is the
// evidence. Nothing is simulated: if a step does not happen, the log says so.
//
// Modes:
//   list                         paired devices (+ HFP audio-gateway role) and CoreAudio devices
//   connect --device <addr|name> open the HFP service-level connection, log features/indicators
//   call --device <addr|name> --number <e164> --i-own-this-number
//        [--say "<sentence>"] [--record-seconds 25] [--out <dir>]
//                               dial, wait for the call to become active, open SCO, record the
//                               remote party to remote.wav while playing the sentence into the
//                               call, then hang up.
//
// Build: ./build.sh   (produces UpdataHfpProbe.app — Bluetooth/microphone permission prompts
// only appear for an app bundle; a bare CLI is silently given zero paired devices).

import AVFoundation
import CoreAudio
import Foundation
import IOBluetooth

// MARK: - evidence log

let started = Date()
var logHandle: FileHandle?
let isoClock: ISO8601DateFormatter = { let f = ISO8601DateFormatter(); f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]; return f }()

func log(_ event: String, _ fields: [String: Any] = [:]) {
    let now = Date()
    var row: [String: Any] = ["t_ms": Int(now.timeIntervalSince(started) * 1000), "ts": isoClock.string(from: now), "event": event]
    for (k, v) in fields { row[k] = v }
    guard let data = try? JSONSerialization.data(withJSONObject: row, options: [.sortedKeys]),
          var line = String(data: data, encoding: .utf8) else { return }
    line += "\n"
    FileHandle.standardOutput.write(line.data(using: .utf8)!)
    logHandle?.write(line.data(using: .utf8)!)
}

func fail(_ reason: String, _ fields: [String: Any] = [:]) -> Never {
    var f = fields
    f["reason"] = reason
    log("fatal", f)
    cleanup("fatal")
    exit(2)
}

// MARK: - arguments

var args: [String: String] = [:]
var flags = Set<String>()
let argv = Array(CommandLine.arguments.dropFirst())
let mode = argv.first ?? "list"
var i = 1
while i < argv.count {
    let a = argv[i]
    if a.hasPrefix("--"), i + 1 < argv.count, !argv[i + 1].hasPrefix("--") {
        args[String(a.dropFirst(2))] = argv[i + 1]
        i += 2
    } else {
        flags.insert(String(a.dropFirst(2)))
        i += 1
    }
}

let outDir = URL(fileURLWithPath: args["out"] ?? FileManager.default.currentDirectoryPath)
try? FileManager.default.createDirectory(at: outDir, withIntermediateDirectories: true)
if let path = args["log"] ?? Optional(outDir.appendingPathComponent("hfp-probe.jsonl").path) {
    FileManager.default.createFile(atPath: path, contents: nil)
    logHandle = FileHandle(forWritingAtPath: path)
}

// MARK: - CoreAudio helpers

struct AudioDev {
    let id: AudioDeviceID
    let name: String
    let uid: String
    let transport: String
    let inputChannels: Int
    let outputChannels: Int
    let sampleRate: Double
    var dict: [String: Any] {
        ["id": Int(id), "name": name, "uid": uid, "transport": transport,
         "in": inputChannels, "out": outputChannels, "rate": sampleRate]
    }
}

func caString(_ id: AudioObjectID, _ sel: AudioObjectPropertySelector) -> String {
    var addr = AudioObjectPropertyAddress(mSelector: sel, mScope: kAudioObjectPropertyScopeGlobal,
                                          mElement: kAudioObjectPropertyElementMain)
    var value: Unmanaged<CFString>?
    var size = UInt32(MemoryLayout<Unmanaged<CFString>?>.size)
    guard AudioObjectGetPropertyData(id, &addr, 0, nil, &size, &value) == noErr, let v = value else { return "" }
    return v.takeRetainedValue() as String
}

func caChannels(_ id: AudioObjectID, _ scope: AudioObjectPropertyScope) -> Int {
    var addr = AudioObjectPropertyAddress(mSelector: kAudioDevicePropertyStreamConfiguration, mScope: scope,
                                          mElement: kAudioObjectPropertyElementMain)
    var size: UInt32 = 0
    guard AudioObjectGetPropertyDataSize(id, &addr, 0, nil, &size) == noErr, size > 0 else { return 0 }
    let raw = UnsafeMutableRawPointer.allocate(byteCount: Int(size), alignment: MemoryLayout<AudioBufferList>.alignment)
    defer { raw.deallocate() }
    guard AudioObjectGetPropertyData(id, &addr, 0, nil, &size, raw) == noErr else { return 0 }
    let list = UnsafeMutableAudioBufferListPointer(raw.assumingMemoryBound(to: AudioBufferList.self))
    return list.reduce(0) { $0 + Int($1.mNumberChannels) }
}

func fourCC(_ v: UInt32) -> String {
    let bytes = [UInt8((v >> 24) & 0xff), UInt8((v >> 16) & 0xff), UInt8((v >> 8) & 0xff), UInt8(v & 0xff)]
    return String(bytes: bytes, encoding: .ascii) ?? String(v)
}

func audioDevices() -> [AudioDev] {
    var addr = AudioObjectPropertyAddress(mSelector: kAudioHardwarePropertyDevices, mScope: kAudioObjectPropertyScopeGlobal,
                                          mElement: kAudioObjectPropertyElementMain)
    var size: UInt32 = 0
    AudioObjectGetPropertyDataSize(AudioObjectID(kAudioObjectSystemObject), &addr, 0, nil, &size)
    var ids = [AudioDeviceID](repeating: 0, count: Int(size) / MemoryLayout<AudioDeviceID>.size)
    AudioObjectGetPropertyData(AudioObjectID(kAudioObjectSystemObject), &addr, 0, nil, &size, &ids)
    return ids.map { id in
        var t: UInt32 = 0
        var tsize = UInt32(MemoryLayout<UInt32>.size)
        var taddr = AudioObjectPropertyAddress(mSelector: kAudioDevicePropertyTransportType, mScope: kAudioObjectPropertyScopeGlobal,
                                               mElement: kAudioObjectPropertyElementMain)
        AudioObjectGetPropertyData(id, &taddr, 0, nil, &tsize, &t)
        var rate: Float64 = 0
        var rsize = UInt32(MemoryLayout<Float64>.size)
        var raddr = AudioObjectPropertyAddress(mSelector: kAudioDevicePropertyNominalSampleRate, mScope: kAudioObjectPropertyScopeGlobal,
                                               mElement: kAudioObjectPropertyElementMain)
        AudioObjectGetPropertyData(id, &raddr, 0, nil, &rsize, &rate)
        return AudioDev(id: id, name: caString(id, kAudioObjectPropertyName), uid: caString(id, kAudioDevicePropertyDeviceUID),
                        transport: fourCC(t), inputChannels: caChannels(id, kAudioObjectPropertyScopeInput),
                        outputChannels: caChannels(id, kAudioObjectPropertyScopeOutput), sampleRate: rate)
    }
}

// MARK: - Bluetooth helpers

func pairedDevices() -> [IOBluetoothDevice] {
    (IOBluetoothDevice.pairedDevices() as? [IOBluetoothDevice]) ?? []
}

/// Root-cause fix (2026-10-23 hold test): right after launch IOBluetooth finishes its Bluetooth
/// permission/coordinator setup asynchronously ("TCC is approved" logs later), and pairedDevices()
/// called in that window returns an empty list. Wait for the device to appear, bounded.
func findDevice(_ key: String) -> IOBluetoothDevice? {
    let norm = key.lowercased().replacingOccurrences(of: ":", with: "-")
    let match: () -> IOBluetoothDevice? = {
        pairedDevices().first { ($0.addressString ?? "").lowercased() == norm || ($0.name ?? "").lowercased() == norm }
    }
    if let d = match() { return d }
    let t0 = Date()
    let limit = Double(args["paired-wait"] ?? "10") ?? 10
    var found: IOBluetoothDevice?
    pump(limit) { found = match(); return found != nil }
    log("bt.paired_wait", ["ms": Int(Date().timeIntervalSince(t0) * 1000), "found": found != nil, "paired_count": pairedDevices().count])
    return found
}

let agFeatureNames: [(UInt32, String)] = [
    (1 << 0, "three_way_calling"), (1 << 1, "ec_nr"), (1 << 2, "voice_recognition"), (1 << 3, "in_band_ring"),
    (1 << 4, "voice_tag"), (1 << 5, "reject_call"), (1 << 6, "enhanced_call_status"), (1 << 7, "enhanced_call_control"),
    (1 << 8, "extended_error_codes"), (1 << 9, "codec_negotiation_msbc"), (1 << 10, "hf_indicators"), (1 << 11, "esco_s4"),
]

func decodeAgFeatures(_ v: UInt32) -> [String] { agFeatureNames.filter { v & $0.0 != 0 }.map { $0.1 } }

// MARK: - SDP channel fix
//
// Some phones (seen on TECNO SPARK 20 / Android 13) encode the RFCOMM server channel in the
// ProtocolDescriptorList as uint32 instead of uint8. macOS's -getRFCOMMChannelID: misreads that
// (returns 1 for uint32(3)), and IOBluetoothHandsFreeDevice then connects to a channel where the
// phone is not listening. We replace the method in this process with one that decodes any width.

func sdpElement(_ el: IOBluetoothSDPDataElement?) -> SdpElement? {
    guard let el = el else { return nil }
    switch el.getTypeDescriptor() {
    case BluetoothSDPDataElementTypeDescriptor(kBluetoothSDPDataElementTypeUnsignedInt):
        return el.getNumberValue().map { .uint($0.uint64Value) } ?? .other
    case BluetoothSDPDataElementTypeDescriptor(kBluetoothSDPDataElementTypeUUID):
        guard let u = el.getUUIDValue() else { return .other }
        let bytes = [UInt8](u as Data)
        return shortUUID(fromBytes: bytes).map { .uuid($0) } ?? .other
    case BluetoothSDPDataElementTypeDescriptor(kBluetoothSDPDataElementTypeDataElementSequence),
         BluetoothSDPDataElementTypeDescriptor(kBluetoothSDPDataElementTypeDataElementAlternative):
        return .sequence((el.getArrayValue() ?? []).compactMap { sdpElement($0 as? IOBluetoothSDPDataElement) })
    default:
        return .other
    }
}

var sdpRejections = Set<String>()

extension IOBluetoothSDPServiceRecord {
    @objc func updata_getRFCOMMChannelID(_ out: UnsafeMutablePointer<BluetoothRFCOMMChannelID>?) -> IOReturn {
        switch decodeRfcommChannel(sdpElement(getAttributeDataElement(4))) {
        case let .channel(ch):
            out?.pointee = ch
            return kIOReturnSuccess
        case .noRfcomm:
            return updata_getRFCOMMChannelID(out) // original implementation (methods are exchanged)
        case let .invalid(why):
            noteRejected(why)
            return kIOReturnBadArgument
        case let .ambiguous(channels):
            noteRejected("ambiguous RFCOMM channels \(channels)")
            return kIOReturnBadArgument
        }
    }

    private func noteRejected(_ why: String) {
        let key = "\(getServiceName() ?? "?"): \(why)"
        if sdpRejections.insert(key).inserted { log("sdp.record_rejected", ["record": getServiceName() ?? "", "reason": why]) }
    }
}

func installSdpChannelFix() {
    let cls: AnyClass = IOBluetoothSDPServiceRecord.self
    guard let orig = class_getInstanceMethod(cls, #selector(IOBluetoothSDPServiceRecord.getRFCOMMChannelID(_:))),
          let repl = class_getInstanceMethod(cls, #selector(IOBluetoothSDPServiceRecord.updata_getRFCOMMChannelID(_:))) else {
        log("sdp.channel_fix", ["installed": false]); return
    }
    method_exchangeImplementations(orig, repl)
    log("sdp.channel_fix", ["installed": true])
}

// MARK: - hands-free session

var sessionCounter = 0

final class Session: NSObject, IOBluetoothHandsFreeDeviceDelegate {
    let hf: IOBluetoothHandsFreeDevice
    let id: Int
    var closingByGateway = false
    var slcSince: Date?
    var slc = false
    var sco = false
    var callActive = false
    var callSetup = 0
    var everActive = false
    var everAlerting = false

    init(device: IOBluetoothDevice) {
        sessionCounter += 1
        id = sessionCounter
        hf = IOBluetoothHandsFreeDevice(device: device, delegate: nil)
        super.init()
        hf.delegate = self
    }

    /// Gateway-initiated close: SCO first, then the service-level connection. Idempotent.
    func close(_ reason: String) {
        if closingByGateway { return }
        closingByGateway = true
        log("hfp.close_requested", ["session": id, "reason": reason, "slc": slc, "sco": sco])
        if sco { hf.disconnectSCO() }
        hf.disconnect()
    }

    /// Detaches this session so late callbacks from the framework cannot change state.
    func retire() { hf.delegate = nil }

    func handsFree(_ device: IOBluetoothHandsFree!, connected status: NSNumber!) {
        slc = status.intValue == 0
        if slc { slcSince = Date() }
        log("hfp.slc_connected", ["session": id, "status": status.intValue,
                                  "ag_features_raw": Int(hf.deviceSupportedFeatures),
                                  "ag_features": decodeAgFeatures(hf.deviceSupportedFeatures),
                                  "hf_features_raw": Int(hf.supportedFeatures),
                                  "call_hold_modes": Int(hf.deviceCallHoldModes)])
        for name in ["service", "call", "callsetup", "callheld", "signal", "roam", "battchg"] {
            log("hfp.indicator", ["name": name, "value": Int(hf.indicator(name))])
        }
    }
    func handsFree(_ device: IOBluetoothHandsFree!, disconnected status: NSNumber!) {
        let heldMs = slcSince.map { Int(Date().timeIntervalSince($0) * 1000) } ?? 0
        slc = false
        slcSince = nil
        // initiator: "gateway" when we asked for it, otherwise the phone or the link went away.
        log("hfp.slc_disconnected", ["session": id, "status": status.intValue, "held_ms": heldMs,
                                     "initiator": closingByGateway ? "gateway" : "remote_or_link",
                                     "acl_connected": hf.device?.isConnected() ?? false])
    }
    func handsFree(_ device: IOBluetoothHandsFree!, scoConnectionOpened status: NSNumber!) {
        sco = status.intValue == 0
        log("hfp.sco_opened", ["status": status.intValue])
    }
    func handsFree(_ device: IOBluetoothHandsFree!, scoConnectionClosed status: NSNumber!) {
        sco = false
        log("hfp.sco_closed", ["status": status.intValue])
    }
    func handsFree(_ device: IOBluetoothHandsFreeDevice!, isServiceAvailable v: NSNumber!) { log("hfp.service", ["value": v.intValue]) }
    func handsFree(_ device: IOBluetoothHandsFreeDevice!, isCallActive v: NSNumber!) {
        callActive = v.intValue == 1
        if callActive { everActive = true }
        log("hfp.call", ["active": callActive])
    }
    func handsFree(_ device: IOBluetoothHandsFreeDevice!, callSetupMode v: NSNumber!) {
        callSetup = v.intValue
        if callSetup == 3 { everAlerting = true }
        // 0 none, 1 incoming, 2 outgoing dialing, 3 outgoing alerting (remote ringing)
        log("hfp.callsetup", ["value": callSetup, "meaning": ["idle", "incoming", "dialing", "alerting"][min(max(callSetup, 0), 3)]])
    }
    func handsFree(_ device: IOBluetoothHandsFreeDevice!, callHoldState v: NSNumber!) { log("hfp.callheld", ["value": v.intValue]) }
    func handsFree(_ device: IOBluetoothHandsFreeDevice!, signalStrength v: NSNumber!) { log("hfp.signal", ["value": v.intValue]) }
    func handsFree(_ device: IOBluetoothHandsFreeDevice!, isRoaming v: NSNumber!) { log("hfp.roam", ["value": v.intValue]) }
    func handsFree(_ device: IOBluetoothHandsFreeDevice!, batteryCharge v: NSNumber!) { log("hfp.battery", ["value": v.intValue]) }
    func handsFree(_ device: IOBluetoothHandsFreeDevice!, incomingCallFrom number: String!) { log("hfp.incoming", ["masked": mask(number ?? "")]) }
    func handsFree(_ device: IOBluetoothHandsFreeDevice!, ringAttempt v: NSNumber!) { log("hfp.ring", ["attempt": v.intValue]) }
    func handsFree(_ device: IOBluetoothHandsFreeDevice!, currentCall: [AnyHashable: Any]!) {
        var safe: [String: Any] = [:]
        for (k, v) in currentCall ?? [:] { safe["\(k)"] = "\(k)".lowercased().contains("number") ? mask("\(v)") : "\(v)" }
        log("hfp.current_call", safe)
    }
    func handsFree(_ device: IOBluetoothHandsFreeDevice!, unhandledResultCode code: String!) { log("hfp.unhandled_result", ["code": code ?? ""]) }
}

func mask(_ n: String) -> String {
    let digits = n.filter { $0.isNumber || $0 == "+" }
    guard digits.count > 6 else { return "***" }
    return String(digits.prefix(4)) + "…" + String(digits.suffix(3))
}

func pump(_ seconds: Double, until: () -> Bool = { false }) {
    let deadline = Date().addingTimeInterval(seconds)
    while Date() < deadline, !until() {
        RunLoop.main.run(mode: .default, before: Date().addingTimeInterval(0.05))
    }
}

func bluetoothAudioDevice(near name: String) -> AudioDev? {
    let devs = audioDevices().filter { $0.transport == "blue" }
    return devs.first { $0.name.lowercased() == name.lowercased() && $0.inputChannels > 0 }
        ?? devs.first { $0.name.lowercased().contains(name.lowercased()) && $0.inputChannels > 0 }
}

// MARK: - audio bridge proof

final class AudioProof {
    let engine = AVAudioEngine()
    let player = AVAudioPlayerNode()
    var file: AVAudioFile?
    var framesIn: Int64 = 0
    var buffersIn = 0
    var firstFrameMs: Int?
    var lastFrameMs: Int?
    var firstVoiceMs: Int?
    var peakRms: Float = 0
    var voicedBuffers = 0

    func setDevice(_ unit: AudioUnit?, _ id: AudioDeviceID) -> OSStatus {
        guard let unit = unit else { return -1 }
        var dev = id
        return AudioUnitSetProperty(unit, kAudioOutputUnitProperty_CurrentDevice, kAudioUnitScope_Global, 0, &dev,
                                    UInt32(MemoryLayout<AudioDeviceID>.size))
    }

    func start(device: AudioDev, recordTo url: URL) throws {
        let inStatus = setDevice(engine.inputNode.audioUnit, device.id)
        let outStatus = setDevice(engine.outputNode.audioUnit, device.id)
        let inFormat = engine.inputNode.outputFormat(forBus: 0)
        log("audio.engine_configure", ["device": device.dict, "set_input_status": Int(inStatus), "set_output_status": Int(outStatus),
                                       "input_format": "\(inFormat)"])
        guard inFormat.sampleRate > 0, inFormat.channelCount > 0 else { throw NSError(domain: "audio", code: 1, userInfo: [NSLocalizedDescriptionKey: "input format unavailable"]) }
        file = try AVAudioFile(forWriting: url, settings: inFormat.settings)
        engine.inputNode.installTap(onBus: 0, bufferSize: 1024, format: inFormat) { [weak self] buf, _ in
            guard let self = self else { return }
            try? self.file?.write(from: buf)
            let now = Int(Date().timeIntervalSince(started) * 1000)
            self.framesIn += Int64(buf.frameLength)
            self.buffersIn += 1
            if self.firstFrameMs == nil { self.firstFrameMs = now }
            self.lastFrameMs = now
            if let ch = buf.floatChannelData?[0], buf.frameLength > 0 {
                var sum: Float = 0
                for k in 0..<Int(buf.frameLength) { sum += ch[k] * ch[k] }
                let rms = (sum / Float(buf.frameLength)).squareRoot()
                self.peakRms = max(self.peakRms, rms)
                if rms > 0.02 { // ≈ -34 dBFS: speech, not line hiss
                    self.voicedBuffers += 1
                    if self.firstVoiceMs == nil { self.firstVoiceMs = now }
                }
            }
        }
        engine.attach(player)
        engine.connect(player, to: engine.mainMixerNode, format: nil)
        engine.prepare()
        try engine.start()
        log("audio.engine_started", ["output_format": "\(engine.outputNode.outputFormat(forBus: 0))"])
    }

    func play(_ url: URL) {
        guard let f = try? AVAudioFile(forReading: url) else { log("audio.play_failed", ["reason": "cannot open \(url.lastPathComponent)"]); return }
        player.scheduleFile(f, at: nil) {
            log("audio.play_finished", ["frames": Int(f.length), "rate": f.processingFormat.sampleRate])
        }
        player.play()
        log("audio.play_started", ["file": url.lastPathComponent, "seconds": Double(f.length) / f.processingFormat.sampleRate])
    }

    func stop() {
        engine.inputNode.removeTap(onBus: 0)
        player.stop()
        engine.stop()
        file = nil
        log("audio.inbound_summary", ["buffers": buffersIn, "frames": Int(framesIn), "first_frame_ms": firstFrameMs ?? -1,
                                      "last_frame_ms": lastFrameMs ?? -1, "first_voice_ms": firstVoiceMs ?? -1,
                                      "voiced_buffers": voicedBuffers, "peak_rms": peakRms])
    }
}

// MARK: - modes

func runList() {
    let paired = pairedDevices()
    log("bt.paired_count", ["count": paired.count, "hint": paired.isEmpty ? "0 can also mean Bluetooth permission was denied to this app" : ""])
    for d in paired {
        log("bt.paired", ["name": d.name ?? "", "address": d.addressString ?? "", "connected": d.isConnected(),
                          "hfp_audio_gateway": d.isHandsFreeAudioGateway, "hfp_hands_free_device": d.isHandsFreeDevice,
                          "class_major": Int(d.deviceClassMajor)])
    }
    for a in audioDevices() { log("audio.device", a.dict) }
}

// Watches the baseband (ACL) link separately from the HFP service-level connection.
final class AclWatcher: NSObject {
    var connectNote: IOBluetoothUserNotification?
    var disconnectNote: IOBluetoothUserNotification?
    let address: String
    init(_ dev: IOBluetoothDevice) {
        address = (dev.addressString ?? "").lowercased()
        super.init()
        connectNote = IOBluetoothDevice.register(forConnectNotifications: self, selector: #selector(connected(_:device:)))
        disconnectNote = dev.register(forDisconnectNotification: self, selector: #selector(disconnected(_:device:)))
    }
    @objc func connected(_ note: IOBluetoothUserNotification!, device: IOBluetoothDevice!) {
        guard (device?.addressString ?? "").lowercased() == address else { return }
        log("bt.acl_connected")
        disconnectNote?.unregister()
        disconnectNote = device.register(forDisconnectNotification: self, selector: #selector(disconnected(_:device:)))
    }
    @objc func disconnected(_ note: IOBluetoothUserNotification!, device: IOBluetoothDevice!) {
        log("bt.acl_disconnected", ["active_session_slc": activeSession?.slc ?? false])
    }
    func stop() { connectNote?.unregister(); disconnectNote?.unregister() }
}

var activeSession: Session?
var aclWatcher: AclWatcher?
var publishedRecord: IOBluetoothSDPServiceRecord?

/// HF feature bits we declare. Framework defaults only; voice recognition (0x08) is added
/// solely by the vr-sco diagnostic, because this Mac cannot deliver a voice audio link.
func configureFeatures(_ s: Session) {
    if flags.contains("allow-voice-assistant") && mode == "vr-sco" { s.hf.supportedFeatures |= 0x08 }
}

/// Opens the HFP service-level connection.
/// Root-cause fix (2026-10-23): when the baseband link is down, IOBluetoothHandsFreeDevice.connect()
/// tries to open RFCOMM before the page completes ("setupRFCOMMChannelForDevice … No channel") and
/// in 2 of 3 observed attempts never retried, so the SLC never formed. We therefore open the
/// baseband first, and retry the SLC a bounded number of times with backoff.
func openSession(_ key: String) -> (IOBluetoothDevice, Session) {
    guard let dev = findDevice(key) else { fail("device not paired with this Mac", ["device": key]) }
    log("bt.device", ["name": dev.name ?? "", "address": dev.addressString ?? "", "hfp_audio_gateway": dev.isHandsFreeAudioGateway,
                      "acl_connected": dev.isConnected()])
    if !dev.isHandsFreeAudioGateway { log("warn", ["reason": "phone does not advertise the HFP audio-gateway service in SDP; trying anyway"]) }
    if aclWatcher == nil { aclWatcher = AclWatcher(dev) }
    let maxAttempts = max(1, Int(args["connect-attempts"] ?? "3") ?? 3)
    let slcTimeout = Double(args["slc-timeout"] ?? "12") ?? 12
    var lastReason = ""
    for attempt in 1...maxAttempts {
        if !dev.isConnected() {
            let t0 = Date()
            let r = dev.openConnection() // synchronous page; returns when connected or paging failed
            log("bt.baseband_open", ["attempt": attempt, "status": Int(r), "connected": dev.isConnected(),
                                     "ms": Int(Date().timeIntervalSince(t0) * 1000)])
            if !dev.isConnected() { lastReason = "baseband page failed (status \(r))" }
        }
        if dev.isConnected() {
            pump(0.5) // let bluetoothd finish its post-connect SDP/security work
            let s = Session(device: dev)
            configureFeatures(s)
            activeSession = s
            log("hfp.connect_requested", ["attempt": attempt, "session": s.id, "hf_features": Int(s.hf.supportedFeatures)])
            s.hf.connect()
            pump(slcTimeout) { s.slc }
            if s.slc { return (dev, s) }
            lastReason = "service-level connection did not open within \(Int(slcTimeout)) s"
            log("hfp.slc_timeout", ["attempt": attempt, "session": s.id, "acl_connected": dev.isConnected()])
            s.close("slc_timeout")
            pump(1)
            s.retire()
            activeSession = nil
        }
        if attempt < maxAttempts {
            let backoff = min(8.0, pow(2.0, Double(attempt)))
            log("hfp.retry_scheduled", ["attempt": attempt + 1, "in_s": backoff, "reason": lastReason])
            pump(backoff)
        }
    }
    fail("HFP connection failed after \(maxAttempts) attempt(s)", ["last_reason": lastReason])
}

/// Single cleanup path for normal exit, signals and the hard timeout. Idempotent.
var cleanedUp = false
func cleanup(_ reason: String) {
    if cleanedUp { return }
    cleanedUp = true
    if let s = activeSession, s.slc || s.sco { s.close(reason); pump(2); s.retire() }
    activeSession = nil
    if let rec = publishedRecord { rec.remove(); publishedRecord = nil; log("sdp.hf_removed", ["reason": reason]) }
    aclWatcher?.stop()
    log("shutdown", ["reason": reason])
}

func runConnect() {
    guard let key = args["device"] else { fail("--device required") }
    if flags.contains("advertise"), let (_, ch) = publishHandsFreeRecord() { log("sdp.hf_published", ["rfcomm_channel": Int(ch)]) }
    let (_, s) = openSession(key)
    pump(Double(args["seconds"] ?? "10") ?? 10)
    s.close("mode_finished")
    pump(2)
    log("done")
}

func runCall() {
    guard let key = args["device"], let number = args["number"] else { fail("--device and --number required") }
    guard flags.contains("i-own-this-number") else { fail("refusing to dial: pass --i-own-this-number to confirm the number is yours/authorized") }
    let digits = number.filter { $0.isNumber || $0 == "+" }
    guard digits.count >= 7 else { fail("number does not look like a phone number") }
    let recordSeconds = Double(args["record-seconds"] ?? "25") ?? 25
    let sentence = args["say"] ?? "Hello, this is the Updata test assistant. This is an automated test call. Please say a short sentence after the tone, then hang up."

    // Prepare the outbound test sentence (macOS TTS, 16 kHz mono) before dialing.
    let speech = outDir.appendingPathComponent("outbound-sentence.wav")
    let say = Process()
    say.executableURL = URL(fileURLWithPath: "/usr/bin/say")
    say.arguments = ["-o", speech.path, "--file-format=WAVE", "--data-format=LEI16@16000", sentence]
    try? say.run(); say.waitUntilExit()
    log("audio.sentence_prepared", ["ok": FileManager.default.fileExists(atPath: speech.path), "text": sentence])

    let (dev, s) = openSession(key)
    log("hfp.dial", ["masked": mask(digits)])
    s.hf.dialNumber(digits)
    pump(60) { s.callActive || (s.callSetup == 0 && s.everAlerting) }
    if !s.callActive {
        log("call.not_answered", ["ever_alerting": s.everAlerting, "callsetup": s.callSetup])
        s.hf.endCall(); pump(3); s.hf.disconnect(); pump(1)
        fail("call was not answered within 60 s")
    }
    let answeredMs = Int(Date().timeIntervalSince(started) * 1000)
    log("call.answered", ["t_answer_ms": answeredMs])

    if !s.sco {
        log("hfp.request_audio", ["via": "transferAudioToComputer"])
        s.hf.transferAudioToComputer()
        pump(4) { s.sco }
        if !s.sco { log("hfp.request_audio", ["via": "connectSCO"]); s.hf.connectSCO(); pump(4) { s.sco } }
    }
    log("hfp.sco_state", ["open": s.sco])

    var device: AudioDev?
    let waitUntil = Date().addingTimeInterval(6)
    while device == nil, Date() < waitUntil {
        device = bluetoothAudioDevice(near: dev.name ?? "")
        if device == nil { pump(0.25) }
    }
    for a in audioDevices() where a.transport == "blue" { log("audio.bt_device", a.dict) }
    guard let audioDev = device else {
        log("audio.no_device", ["reason": "no CoreAudio input device for the phone appeared while SCO was requested"])
        s.hf.endCall(); pump(3); s.hf.disconnect(); pump(1)
        fail("HFP audio is not exposed to applications on this Mac")
    }

    let proof = AudioProof()
    do {
        try proof.start(device: audioDev, recordTo: outDir.appendingPathComponent("remote.wav"))
    } catch {
        s.hf.endCall(); pump(3); s.hf.disconnect(); pump(1)
        fail("audio engine failed", ["error": "\(error)"])
    }
    pump(1.5)
    proof.play(speech)
    pump(recordSeconds) { !s.callActive }
    log("call.state_before_hangup", ["active": s.callActive])
    proof.stop()
    if s.callActive { s.hf.endCall(); log("hfp.end_call_sent"); pump(8) { !s.callActive } }
    log("call.ended", ["active_after": s.callActive, "duration_ms": Int(Date().timeIntervalSince(started) * 1000) - answeredMs])
    s.hf.disconnect()
    pump(2)
    log("done", ["remote_wav": outDir.appendingPathComponent("remote.wav").path])
}

final class SdpWaiter: NSObject {
    var done = false
    @objc func sdpQueryComplete(_ device: IOBluetoothDevice!, status: IOReturn) {
        log("sdp.query_complete", ["status": Int(status)])
        done = true
    }
}

func describeRecords(_ dev: IOBluetoothDevice) {
    for case let rec as IOBluetoothSDPServiceRecord in (dev.services ?? []) {
        var channel: BluetoothRFCOMMChannelID = 0
        let hasRfcomm = rec.getRFCOMMChannelID(&channel) == kIOReturnSuccess
        var uuids: [String] = []
        if let classList = rec.getAttributeDataElement(1)?.getArrayValue() {
            for case let el as IOBluetoothSDPDataElement in classList {
                if let u = el.getUUIDValue() { uuids.append("\(u)") }
            }
        }
        if flags.contains("raw"), (rec.getServiceName() ?? "").contains("Gateway") {
            var raw: [String: String] = [:]
            for (k, v) in rec.attributes ?? [:] { raw["\(k)"] = "\(v)".replacingOccurrences(of: "\n", with: " ") }
            log("sdp.record_raw", ["name": rec.getServiceName() ?? "", "attrs": raw])
        }
        log("sdp.record", ["name": rec.getServiceName() ?? "", "class_uuids": uuids,
                           "rfcomm_channel": hasRfcomm ? Int(channel) : -1])
    }
}

func runSdp() {
    guard let key = args["device"], let dev = findDevice(key) else { fail("--device required / not paired") }
    log("sdp.cached_records", ["count": dev.services?.count ?? 0, "last_update": "\(String(describing: dev.getLastServicesUpdate()))"])
    describeRecords(dev)
    if flags.contains("cached") { return } // no radio traffic: decode what macOS already cached
    let w = SdpWaiter()
    let r = dev.performSDPQuery(w)
    log("sdp.query_started", ["status": Int(r)])
    pump(Double(args["wait"] ?? "60") ?? 60) { w.done }
    describeRecords(dev)
    if let rec = dev.handsFreeAudioGatewayServiceRecord() {
        var ch: BluetoothRFCOMMChannelID = 0
        _ = rec.getRFCOMMChannelID(&ch)
        log("sdp.hfp_ag", ["rfcomm_channel": Int(ch)])
    } else { log("sdp.hfp_ag", ["record": "none"]) }
}

// Publishes a Hands-Free (0x111E) SDP record so Android, at pairing time, sees this Mac
// as a hands-free unit and enables "Phone calls" for it. The record lives only while
// this process runs.
final class RfcommWatcher: NSObject {
    @objc func opened(_ note: IOBluetoothUserNotification!, channel: IOBluetoothRFCOMMChannel!) {
        log("rfcomm.incoming_open", ["channel": Int(channel.getID()), "from": channel.getDevice()?.addressString ?? ""])
    }
}

func publishHandsFreeRecord() -> (IOBluetoothSDPServiceRecord, BluetoothRFCOMMChannelID)? {
    func u16(_ v: UInt16) -> IOBluetoothSDPUUID { IOBluetoothSDPUUID(uuid16: v) }
    func uint(_ size: Int, _ v: Int) -> [String: Any] { ["DataElementType": 1, "DataElementSize": size, "DataElementValue": v] }
    let dict: [String: Any] = [
        "0001 - ServiceClassIDList": [u16(0x111E), u16(0x1203)],
        "0004 - ProtocolDescriptorList": [[u16(0x0100)], [u16(0x0003), uint(1, 10)]],
        "0005 - BrowseGroupList*": [u16(0x1002)],
        "0009 - BluetoothProfileDescriptorList": [[u16(0x111E), uint(2, 0x0107)]],
        "0100 - ServiceName*": "Updata Hands-Free",
        // CLI presentation (bit 2) and remote volume (bit 4). Voice recognition (bit 3) only for the
        // explicit vr-sco diagnostic: this Mac cannot carry a voice audio link.
        "0311 - SupportedFeatures": uint(2, (flags.contains("allow-voice-assistant") && mode == "vr-sco") ? 0x001C : 0x0014),
    ]
    guard let rec = IOBluetoothSDPServiceRecord.publishedServiceRecord(with: dict) else { return nil }
    publishedRecord = rec
    var ch: BluetoothRFCOMMChannelID = 0
    _ = rec.getRFCOMMChannelID(&ch)
    return (rec, ch)
}

func runAdvertise() {
    guard let (rec, ch) = publishHandsFreeRecord() else { fail("could not publish the Hands-Free SDP record") }
    log("sdp.hf_published", ["rfcomm_channel": Int(ch), "handle": Int(rec.getHandle(nil) == kIOReturnSuccess ? 1 : 0)])
    let w = RfcommWatcher()
    let n = IOBluetoothRFCOMMChannel.register(forChannelOpenNotifications: w, selector: #selector(RfcommWatcher.opened(_:channel:)),
                                              withChannelID: ch, direction: kIOBluetoothUserNotificationChannelDirectionIncoming)
    log("advertise.waiting", ["seconds": Double(args["seconds"] ?? "300") ?? 300,
                              "todo": "on the phone: forget this Mac, pair again, enable Phone calls"])
    var lastConnected: Bool?
    let deadline = Date().addingTimeInterval(Double(args["seconds"] ?? "300") ?? 300)
    while Date() < deadline {
        if let key = args["device"], let d = findDevice(key) {
            let c = d.isConnected()
            if c != lastConnected { log("bt.connection", ["connected": c]); lastConnected = c }
        }
        pump(1)
    }
    n?.unregister()
    rec.remove()
    publishedRecord = nil
    log("sdp.hf_removed")
}

final class RfcommOpener: NSObject, IOBluetoothRFCOMMChannelDelegate {
    var result: IOReturn?
    func rfcommChannelOpenComplete(_ ch: IOBluetoothRFCOMMChannel!, status error: IOReturn) { result = error }
    func rfcommChannelData(_ ch: IOBluetoothRFCOMMChannel!, data p: UnsafeMutableRawPointer!, length: Int) {
        let text = String(decoding: UnsafeRawBufferPointer(start: p, count: length), as: UTF8.self)
        log("rfcomm.data", ["text": text.trimmingCharacters(in: .whitespacesAndNewlines)])
    }
}

func runRfcomm() {
    guard let key = args["device"], let dev = findDevice(key) else { fail("--device required / not paired") }
    for chStr in (args["channels"] ?? "12,2,1").split(separator: ",") {
        guard let ch = UInt8(chStr) else { continue }
        let o = RfcommOpener()
        var chan: IOBluetoothRFCOMMChannel?
        let r = dev.openRFCOMMChannelAsync(&chan, withChannelID: ch, delegate: o)
        pump(12) { o.result != nil }
        log("rfcomm.open", ["channel": Int(ch), "start_status": Int(r), "result": o.result.map { Int($0) } ?? -1,
                            "result_hex": o.result.map { String(format: "0x%x", $0) } ?? "timeout"])
        chan?.close()
        pump(2)
    }
}

// Opens the hands-free audio link with no call and checks whether macOS exposes it as a
// CoreAudio device. Records whatever the phone sends for a few seconds; plays nothing unless --say.
func runSco() {
    guard let key = args["device"] else { fail("--device required") }
    let (dev, s) = openSession(key)
    for a in audioDevices() where a.transport == "blue" { log("audio.bt_device_before", a.dict) }
    s.hf.connectSCO()
    log("hfp.connect_sco_requested")
    pump(8) { s.sco }
    log("hfp.sco_state", ["open": s.sco, "isSCOConnected": s.hf.isSCOConnected()])
    pump(1)
    for a in audioDevices() where a.transport == "blue" { log("audio.bt_device_after", a.dict) }
    if let ad = bluetoothAudioDevice(near: dev.name ?? "") {
        let proof = AudioProof()
        do {
            try proof.start(device: ad, recordTo: outDir.appendingPathComponent("sco-idle.wav"))
            if let text = args["say"] {
                let speech = outDir.appendingPathComponent("sco-sentence.wav")
                let p = Process(); p.executableURL = URL(fileURLWithPath: "/usr/bin/say")
                p.arguments = ["-o", speech.path, "--file-format=WAVE", "--data-format=LEI16@16000", text]
                try? p.run(); p.waitUntilExit()
                proof.play(speech)
            }
            pump(Double(args["seconds"] ?? "5") ?? 5)
            proof.stop()
        } catch { log("audio.engine_failed", ["error": "\(error)"]) }
    } else {
        log("audio.no_device", ["reason": "no CoreAudio device for the phone"])
    }
    s.close("mode_finished"); pump(2)
    log("done")
}

// Asks the phone to open the audio link itself (voice-recognition activation, AT+BVRA=1),
// the same direction a real call uses, and checks whether macOS accepts it and exposes audio.
func runVoiceRecognitionSco() {
    guard let key = args["device"] else { fail("--device required") }
    guard flags.contains("allow-voice-assistant") else {
        fail("vr-sco starts the phone's voice assistant; pass --allow-voice-assistant only with the phone owner's approval. It is a diagnostic, not a call-audio path.")
    }
    if flags.contains("advertise"), let (_, ch) = publishHandsFreeRecord() { log("sdp.hf_published", ["rfcomm_channel": Int(ch)]) }
    pump(Double(args["hold"] ?? "0") ?? 0)
    let (dev, s) = openSession(key)
    pump(Double(args["settle"] ?? "0") ?? 0)
    s.hf.send(atCommand: "AT+BVRA=1")
    log("hfp.at_sent", ["cmd": "AT+BVRA=1"])
    var device: AudioDev?
    let until = Date().addingTimeInterval(Double(args["seconds"] ?? "8") ?? 8)
    while Date() < until {
        pump(0.5)
        if device == nil, let d = bluetoothAudioDevice(near: dev.name ?? "") { device = d; log("audio.device_appeared", d.dict) }
    }
    log("hfp.sco_state", ["open": s.sco, "isSCOConnected": s.hf.isSCOConnected()])
    for a in audioDevices() where a.transport == "blue" { log("audio.bt_device", a.dict) }
    s.hf.send(atCommand: "AT+BVRA=0")
    log("hfp.at_sent", ["cmd": "AT+BVRA=0"])
    pump(2)
    s.close("mode_finished"); pump(2)
    log("done")
}

// Connection-stability test. Holds the HFP service-level connection with no call and WITHOUT
// publishing the Hands-Free record (so Android does not make this Mac its active call device),
// logs a heartbeat from cached indicators (no extra AT traffic), and reconnects a bounded number
// of times with backoff if the phone or the link drops it.
func runHold() {
    guard let key = args["device"] else { fail("--device required") }
    let total = Double(args["seconds"] ?? "300") ?? 300
    let beat = Double(args["heartbeat"] ?? "30") ?? 30
    let maxReconnects = Int(args["max-reconnects"] ?? "2") ?? 2
    var (dev, s) = openSession(key)
    var reconnects = 0
    var drops: [[String: Any]] = []
    let begin = Date()
    let deadline = begin.addingTimeInterval(total)
    var nextBeat = Date().addingTimeInterval(beat)
    while Date() < deadline {
        pump(0.5)
        if Date() >= nextBeat {
            log("hold.heartbeat", ["session": s.id, "slc": s.slc, "acl": dev.isConnected(),
                                   "held_ms": s.slcSince.map { Int(Date().timeIntervalSince($0) * 1000) } ?? 0,
                                   "signal": Int(s.hf.indicator("signal")), "service": Int(s.hf.indicator("service")),
                                   "drops": drops.count, "reconnects": reconnects])
            nextBeat = nextBeat.addingTimeInterval(beat)
        }
        if !s.slc {
            drops.append(["at_s": Int(Date().timeIntervalSince(begin)), "acl": dev.isConnected(), "session": s.id])
            log("hold.slc_lost", drops.last!)
            s.retire()
            activeSession = nil
            if reconnects >= maxReconnects { fail("connection lost and reconnect budget exhausted", ["drops": drops.count]) }
            reconnects += 1
            let backoff = min(30.0, 2.0 * pow(2.0, Double(reconnects)))
            log("hold.reconnect_scheduled", ["in_s": backoff, "reconnect": reconnects])
            pump(backoff)
            (dev, s) = openSession(key)
        }
    }
    log("hold.summary", ["seconds": Int(Date().timeIntervalSince(begin)), "drops": drops.count, "reconnects": reconnects,
                         "final_slc": s.slc, "final_acl": dev.isConnected()])
    s.close("hold_finished")
    pump(2)
    log("done")
}

// Hard stop so an unattended run can never hold a call open.
var signalSources: [DispatchSourceSignal] = []
for sig in [SIGINT, SIGTERM] {
    signal(sig, SIG_IGN)
    let src = DispatchSource.makeSignalSource(signal: sig, queue: .main)
    src.setEventHandler { cleanup(sig == SIGINT ? "sigint" : "sigterm"); exit(130) }
    src.resume()
    signalSources.append(src)
}

let hardTimeout: Double = mode == "advertise" ? 900 : (mode == "hold" ? (Double(args["seconds"] ?? "300") ?? 300) + 120 : 240)
DispatchQueue.main.asyncAfter(deadline: .now() + hardTimeout) {
    cleanup("hard_timeout")
    log("fatal", ["reason": "hard timeout (\(Int(hardTimeout)) s)"])
    exit(3)
}

log("start", ["mode": mode, "os": ProcessInfo.processInfo.operatingSystemVersionString])
if !flags.contains("no-sdp-fix") { installSdpChannelFix() }
switch mode {
case "list": runList()
case "connect": runConnect()
case "call": runCall()
case "sdp": runSdp()
case "sco": runSco()
case "vr-sco": runVoiceRecognitionSco()
case "rfcomm": runRfcomm()
case "advertise": runAdvertise()
case "hold": runHold()
default: fail("unknown mode \(mode)")
}
cleanup("done")
exit(0)
