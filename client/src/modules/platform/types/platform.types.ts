export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  uptime?: number;
  version?: string;
  checks?: {
    database?: ComponentHealth;
    redis?: ComponentHealth;
    queue?: ComponentHealth;
    storage?: ComponentHealth;
  };
}

export interface ComponentHealth {
  status: 'up' | 'down' | 'degraded';
  latency?: number;
  message?: string;
}

export interface BackgroundJob {
  id: string;
  name: string;
  queue: string;
  status: 'active' | 'completed' | 'failed' | 'delayed' | 'waiting';
  data?: Record<string, unknown>;
  result?: unknown;
  error?: string;
  attempts: number;
  maxAttempts: number;
  createdAt: string;
  processedAt?: string;
  completedAt?: string;
  duration?: number;
}

export interface QueueStats {
  name: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}

export interface SystemFile {
  key: string;
  name: string;
  size: number;
  mimeType: string;
  bucket: string;
  uploadedBy?: string;
  createdAt: string;
  url?: string;
}
