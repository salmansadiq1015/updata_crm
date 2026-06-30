export const CHAT_FILE_MAX_SIZE_BYTES = 25 * 1024 * 1024;
export const CHAT_AUDIO_MAX_DURATION_SECONDS = 120;

export const CHAT_FILE_ACCEPTED_TYPES = [
  'image/*',
  'video/*',
  'audio/*',
  '.pdf',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
  '.txt',
  '.csv',
  '.zip',
].join(',');

export const CHAT_MESSAGE_TYPES = [
  { value: 'TEXT', labelKey: 'chat.searchTypeText', fallback: 'Text' },
  { value: 'PHOTO', labelKey: 'chat.searchTypeImages', fallback: 'Images' },
  { value: 'DOCUMENT', labelKey: 'chat.searchTypeDocuments', fallback: 'Documents' },
  { value: 'AUDIO', labelKey: 'chat.searchTypeAudio', fallback: 'Audio' },
  { value: 'VIDEO', labelKey: 'chat.searchTypeVideo', fallback: 'Video' },
];

export const CHAT_FILTERS = [
  { value: 'All', labelKey: 'common.all' },
  { value: 'Direct', labelKey: 'chat.direct' },
  { value: 'Groups', labelKey: 'chat.groups' },
  { value: 'Projects', labelKey: 'common.projects' },
  { value: 'Channels', labelKey: 'chat.channels' },
];
