// Stable IDs and versioned local assets keep avatars durable without signed URLs.
export const agentAvatarPresets = Object.freeze([
  ['aria', 'Aria', 'people', 'Warm, confident', 16824],
  ['atlas', 'Atlas', 'people', 'Calm, professional', 17036],
  ['nova', 'Nova', 'people', 'Friendly, expressive', 25140],
  ['kai', 'Kai', 'people', 'Thoughtful, approachable', 22156],
  ['orbit', 'Orbit', 'ai', 'Clear, dependable', 17874],
  ['luma', 'Luma', 'ai', 'Bright, welcoming', 20296],
  ['maya', 'Maya', 'people', 'Poised, attentive', 15480],
  ['zara', 'Zara', 'people', 'Warm, reassuring', 15512],
  ['elena', 'Elena', 'people', 'Confident, welcoming', 18482],
  ['theo', 'Theo', 'people', 'Friendly, assured', 23582],
  ['owen', 'Owen', 'people', 'Experienced, thoughtful', 17916],
  ['ravi', 'Ravi', 'people', 'Calm, approachable', 17120],
  ['aster', 'Aster', 'ai', 'Bright, composed', 18882],
  ['echo', 'Echo', 'ai', 'Precise, dependable', 17414],
  ['vega', 'Vega', 'ai', 'Clear, intelligent', 19820],
  ['sol', 'Sol', 'ai', 'Gentle, radiant', 24740],
].map(([id, name, category, description, size]) => Object.freeze({
  _id: `preset:${id}`, presetId: id, name, category, description,
  url: `/avatars/agents/${id}-v1.webp`, thumbnailUrl: `/avatars/agents/${id}-thumb-v1.webp`,
  width: 512, height: 512, size, createdAt: '2026-10-28T00:00:00.000Z',
})));
export const agentAvatarPresetIds = agentAvatarPresets.map(preset => preset.presetId);
export const findAvatarPreset = id => agentAvatarPresets.find(preset => preset.presetId === id);
