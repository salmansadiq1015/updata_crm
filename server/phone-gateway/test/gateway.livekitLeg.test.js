import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { LiveKitLeg } from '../src/gateway/livekitLeg.js';

function rtc(participants) {
  return {
    Room: class extends EventEmitter {
      remoteParticipants = new Map(participants.map(identity => [identity, { identity }]));
      localParticipant = { publishTrack: async () => {}, setAttributes: async () => {} };
      async connect() {} async disconnect() {}
    },
    RoomEvent: { TrackSubscribed: 'track', ParticipantDisconnected: 'left', Disconnected: 'closed' },
    AudioSource: class {}, LocalAudioTrack: { createAudioTrack: () => ({}) }, TrackPublishOptions: class {},
    TrackSource: { SOURCE_MICROPHONE: 1 }, TrackKind: { KIND_AUDIO: 'audio' },
    AudioStream: class { async *[Symbol.asyncIterator]() {} },
  };
}
test('a listener joining, publishing or leaving is never treated as the voice agent', async () => {
  const leg = new LiveKitLeg({ rtc: rtc(['agent-worker', 'monitor-view']), url: 'wss://test', token: 'test' });
  let left = 0; leg.on('agentLeft', () => left++);
  await leg.connect(); assert.equal(leg.agentConnected, true);
  leg.room.emit('track', { kind: 'audio' }, {}, { identity: 'monitor-view' });
  assert.equal(leg.stats.agentTracks, 0);
  leg.room.emit('left', { identity: 'monitor-view' });
  assert.equal(left, 0); assert.equal(leg.agentConnected, true);
  leg.room.emit('left', { identity: 'agent-worker' });
  assert.equal(left, 1); assert.equal(leg.agentConnected, false);
  await leg.close();
});
test('listeners alone cannot mask a missing agent, while a second real agent keeps the line connected', async () => {
  const alone = new LiveKitLeg({ rtc: rtc(['monitor-only']), url: 'wss://test', token: 'test' });
  await alone.connect(); assert.equal(alone.agentConnected, false); await alone.close();
  const leg = new LiveKitLeg({ rtc: rtc(['agent-one', 'agent-two']), url: 'wss://test', token: 'test' });
  await leg.connect(); leg.room.emit('left', { identity: 'agent-one' });
  assert.equal(leg.agentConnected, true); await leg.close();
});
