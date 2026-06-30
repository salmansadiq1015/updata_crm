'use client';

import { useCallback, useState } from 'react';
import { useLanguage } from '@/lib/i18n/language-context';
import { CHAT_FILE_MAX_SIZE_BYTES } from '../constants/chat-config';
import { chatService } from '../services/chat-service';
import { formatBytes, getFileMessageType } from '../utils/chat-file-utils';

export function useChatAttachmentUpload() {
  const { t } = useLanguage();
  const [uploadProgress, setUploadProgress] = useState(null);
  const [uploadError, setUploadError] = useState('');

  const uploadAttachment = useCallback(async (file) => {
    setUploadError('');

    if (file.size > CHAT_FILE_MAX_SIZE_BYTES) {
      const message = t('chat.fileTooLarge', 'File too large. Maximum size is 25 MB (your file: {size})', {
        size: formatBytes(file.size),
      });
      setUploadError(message);
      return null;
    }

    const messageType = getFileMessageType(file);
    setUploadProgress(0);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('module', 'chat');

      const response = await chatService.uploadFile(formData, (pct) => setUploadProgress(pct));
      return {
        url: response.attachmentUrl || response.url || response.fileUrl,
        fileId: response._id || response.id || response.attachmentFileId,
        messageType,
        name: file.name,
        size: file.size,
      };
    } catch (error) {
      setUploadError(error?.message ?? t('chat.uploadFailed', 'Upload failed. Please try again.'));
      return null;
    } finally {
      setUploadProgress(null);
    }
  }, [t]);

  const clearUploadState = useCallback(() => {
    setUploadError('');
    setUploadProgress(null);
  }, []);

  return {
    uploadAttachment,
    uploadProgress,
    uploadError,
    setUploadError,
    clearUploadState,
  };
}
