/**
 * The phone line inside the call's LiveKit room. The gateway joins as `sip-<callId>`, exactly the
 * identity a LiveKit SIP participant would have, and drives `sip.callStatus`
 * (dialing → ringing → active → hangup). The existing agent worker therefore waits for the answer,
 * talks, and ends the call without knowing the phone is a Bluetooth bridge.
 *
 *   phone → ESP32 → gateway: pushPhoneAudio(8 kHz PCM) → published microphone track
 *   agent track → AudioStream resampled to 8 kHz → 'agentAudio' events → ESP32 → phone
 *
 * `rtc` is the @livekit/rtc-node module (injected so tests can run without WebRTC).
 */

import { EventEmitter } from 'node:events';

const RATE = 8000;
const MAX_BACKLOG_MS = 200; // drop phone audio rather than let latency grow without bound

export class LiveKitLeg extends EventEmitter {
  constructor({ rtc, url, token, identity }) {
    super();
    this.rtc = rtc;
    this.url = url;
    this.token = token;
    this.identity = identity;
    this.room = null;
    this.source = null;
    this.capture = Promise.resolve();
    this.closed = false;
    this.stats = { phoneFramesSent: 0, phoneFramesDropped: 0, agentFrames: 0, agentTracks: 0 };
    this.agentConnected = false;
  }

  async connect() {
    const { Room, RoomEvent, AudioSource, LocalAudioTrack, TrackPublishOptions, TrackSource, TrackKind, AudioStream } = this.rtc;
    this.room = new Room();
    this.room.on(RoomEvent.TrackSubscribed, (track, _pub, participant) => {
      if (track.kind !== TrackKind.KIND_AUDIO || String(participant.identity).startsWith('sip-')) return;
      this.agentConnected = true;
      this.stats.agentTracks += 1;
      this.emit('agentJoined', participant.identity);
      this._readAgent(new AudioStream(track, { sampleRate: RATE, numChannels: 1 }));
    });
    this.room.on(RoomEvent.ParticipantDisconnected, (participant) => {
      if (!String(participant.identity).startsWith('sip-')) {
        this.agentConnected = false;
        this.emit('agentLeft', participant.identity);
      }
    });
    this.room.on(RoomEvent.Disconnected, (reason) => {
      if (!this.closed) this.emit('closed', String(reason ?? 'disconnected'));
    });
    await this.room.connect(this.url, this.token, { autoSubscribe: true, dynacast: false });
    this.source = new AudioSource(RATE, 1, 1000);
    const track = LocalAudioTrack.createAudioTrack('phone-line', this.source);
    const opts = new TrackPublishOptions();
    opts.source = TrackSource.SOURCE_MICROPHONE;
    await this.room.localParticipant.publishTrack(track, opts);
    // Agents already in the room before we joined.
    for (const participant of this.room.remoteParticipants?.values?.() || []) {
      if (!String(participant.identity).startsWith('sip-')) this.agentConnected = true;
    }
  }

  async setCallStatus(status) {
    if (!this.room || this.closed) return;
    await this.room.localParticipant.setAttributes({ 'sip.callStatus': status });
  }

  /** 8 kHz mono Int16Array from the phone. Never awaits the network from the audio path. */
  pushPhoneAudio(pcm) {
    if (!this.source || this.closed) return;
    if (this.source.queuedDuration > MAX_BACKLOG_MS) {
      this.stats.phoneFramesDropped += 1;
      return;
    }
    const frame = new this.rtc.AudioFrame(Int16Array.from(pcm), RATE, 1, pcm.length);
    this.capture = this.capture.then(() => this.source.captureFrame(frame)).catch((err) => this.emit('error', err));
    this.stats.phoneFramesSent += 1;
  }

  async _readAgent(stream) {
    try {
      for await (const frame of stream) {
        if (this.closed) break;
        this.stats.agentFrames += 1;
        // Copy: the frame's buffer belongs to the SDK and is reused.
        this.emit('agentAudio', Int16Array.from(frame.data));
      }
    } catch (err) {
      if (!this.closed) this.emit('error', err);
    }
  }

  async close() {
    if (this.closed) return;
    this.closed = true;
    try {
      await this.room?.disconnect();
    } catch { /* already gone */ }
  }
}
