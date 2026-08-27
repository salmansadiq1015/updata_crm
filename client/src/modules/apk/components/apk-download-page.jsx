'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Download, Upload, Copy, Check, Smartphone, AlertCircle, Loader2 } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/language-context';
import { usePermissions } from '@/shared/hooks/use-permissions';
import { PERMISSIONS } from '@/shared/constants/permissions';
import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('de-CH', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function ApkDownloadPage() {
  const { t } = useLanguage();
  const { hasPermission } = usePermissions();
  const isAdmin = hasPermission(PERMISSIONS.SETTINGS_ADMIN);

  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);

  // Upload state
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState(null);
  const fileInputRef = useRef(null);

  const fetchInfo = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiClient.get(ENDPOINTS.APK.INFO);
      setInfo(res.data?.data ?? null);
    } catch {
      setError(t('apk.loadError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchInfo();
  }, [fetchInfo]);

  const handleCopy = async () => {
    if (!info?.downloadUrl) return;
    try {
      await navigator.clipboard.writeText(info.downloadUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard may fail in insecure contexts */ }
  };

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.apk')) {
      setUploadError(t('apk.invalidFile'));
      return;
    }

    try {
      setUploading(true);
      setUploadProgress(0);
      setUploadError(null);

      // Get upload credentials from our backend
      const credRes = await apiClient.post(ENDPOINTS.APK.UPLOAD_CREDENTIALS);
      const { uploadUrl, token } = credRes.data?.data ?? {};

      if (!uploadUrl || !token) {
        throw new Error('Missing upload credentials');
      }

      // Upload directly to the file server via XHR (bypasses Express body limit)
      await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', uploadUrl);
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);

        xhr.upload.onprogress = (ev) => {
          if (ev.lengthComputable) {
            setUploadProgress(Math.round((ev.loaded / ev.total) * 100));
          }
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else {
            reject(new Error(xhr.responseText || `HTTP ${xhr.status}`));
          }
        };

        xhr.onerror = () => reject(new Error(t('apk.networkError')));

        const formData = new FormData();
        formData.append('apk', file);
        xhr.send(formData);
      });

      // Refresh info after successful upload
      await fetchInfo();
    } catch (err) {
      setUploadError(err.message || t('apk.uploadError'));
    } finally {
      setUploading(false);
      setUploadProgress(0);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Smartphone className="h-6 w-6" />
          {t('apk.title')}
        </h1>
        <p className="text-muted-foreground mt-1">{t('apk.subtitle')}</p>
      </div>

      {/* Info / Download card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t('apk.title')}</CardTitle>
          <CardDescription>{t('apk.subtitle')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span className="text-sm">{error}</span>
            </div>
          ) : !info?.name ? (
            <p className="text-sm text-muted-foreground py-4">{t('apk.noApk')}</p>
          ) : (
            <>
              {/* File details */}
              <div className="rounded-lg border p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('apk.fileName')}</span>
                  <span className="font-medium">{info.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('apk.fileSize')}</span>
                  <span className="font-medium">{formatBytes(info.size)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('apk.uploadDate')}</span>
                  <span className="font-medium">{formatDate(info.uploadedAt)}</span>
                </div>
              </div>

              {/* Download button */}
              <Button asChild className="w-full">
                <a href={info.downloadUrl} download>
                  <Download className="h-4 w-4 mr-2" />
                  {t('apk.download')}
                </a>
              </Button>

              {/* Copy link */}
              <div className="flex gap-2">
                <Input readOnly value={info.downloadUrl} className="text-xs" />
                <Button variant="outline" size="icon" onClick={handleCopy} className="shrink-0">
                  {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Upload section (admin only) */}
      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t('apk.uploadTitle')}</CardTitle>
            <CardDescription>{t('apk.uploadHint')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".apk"
                onChange={handleUpload}
                disabled={uploading}
                className="hidden"
                id="apk-file-input"
              />
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="w-full"
              >
                {uploading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {t('apk.uploading')}
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    {t('apk.selectFile')}
                  </>
                )}
              </Button>
            </div>

            {uploading && (
              <div className="space-y-1">
                <Progress value={uploadProgress} className="h-2" />
                <p className="text-xs text-muted-foreground text-center">{uploadProgress}%</p>
              </div>
            )}

            {uploadError && (
              <div className="flex items-center gap-2 text-destructive text-sm">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{uploadError}</span>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
