'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import { X, Camera, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function BarcodeScanner({ onScan, onClose }) {
  const videoRef = useRef(null);
  const [error, setError] = useState(null);
  const [scanning, setScanning] = useState(true);
  const streamRef = useRef(null);

  useEffect(() => {
    let detector;
    let animFrame;

    async function startScanning() {
      try {
        if (!('BarcodeDetector' in window)) {
          setError('Barcode scanner not supported in this browser');
          return;
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        detector = new BarcodeDetector({
          formats: ['ean_13', 'ean_8', 'code_128', 'code_39', 'qr_code', 'data_matrix'],
        });

        const scan = async () => {
          if (!scanning || !videoRef.current) return;
          try {
            const barcodes = await detector.detect(videoRef.current);
            if (barcodes.length > 0) {
              setScanning(false);
              stopStream();
              onScan?.(barcodes[0].rawValue, barcodes[0].format);
              return;
            }
          } catch {}
          animFrame = requestAnimationFrame(scan);
        };
        scan();
      } catch (err) {
        setError(err.message || 'Camera access denied');
      }
    }

    if (scanning) startScanning();

    return () => {
      cancelAnimationFrame(animFrame);
      stopStream();
    };
  }, [scanning, onScan]);

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  const handleClose = () => {
    stopStream();
    onClose?.();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      <div className="flex items-center justify-between px-4 py-3">
        <p className="text-sm text-white font-medium">Scan Barcode / QR Code</p>
        <Button variant="ghost" size="sm" onClick={handleClose} className="text-white h-11 w-11 p-0" aria-label="Close">
          <X className="h-5 w-5" />
        </Button>
      </div>

      <div className="flex-1 flex items-center justify-center relative">
        {error ? (
          <div className="text-center px-8">
            <AlertCircle className="h-12 w-12 text-red-400 mx-auto mb-3" />
            <p className="text-sm text-white/80">{error}</p>
            <p className="text-xs text-white/50 mt-2">
              Try using a browser that supports the BarcodeDetector API (Chrome, Edge).
            </p>
          </div>
        ) : (
          <>
            <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
            {/* Scanning overlay */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-64 h-64 border-2 border-white/50 rounded-2xl relative">
                <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-white rounded-tl-lg" />
                <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-white rounded-tr-lg" />
                <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-white rounded-bl-lg" />
                <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-white rounded-br-lg" />
              </div>
            </div>
          </>
        )}
      </div>

      <div className="px-4 py-4 bg-black/80">
        <p className="text-xs text-white/50 text-center">
          Point camera at barcode or QR code
        </p>
      </div>
    </div>
  );
}
