'use client';

import { useState, useCallback } from 'react';
import { compressPhoto, generateThumbnail, captureGeoLocation } from '../lib/photo-utils';

export function useCamera() {
  const [isProcessing, setIsProcessing] = useState(false);

  const processPhoto = useCallback(async (file) => {
    setIsProcessing(true);
    try {
      const [compressed, thumbnail, geo] = await Promise.all([
        compressPhoto(file),
        generateThumbnail(file),
        captureGeoLocation(),
      ]);
      return { compressed, thumbnail, geo };
    } finally {
      setIsProcessing(false);
    }
  }, []);

  return { processPhoto, isProcessing };
}
