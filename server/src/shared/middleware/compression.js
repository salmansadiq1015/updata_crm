import compression from 'compression';

/**
 * Response compression.
 * Level 6: good balance of compression ratio vs CPU.
 * Threshold 1KB: don't compress tiny responses (overhead > savings).
 */
export const compressionMiddleware = compression({
  level: 6,
  threshold: 1024,
  filter: (req, res) => {
    // Don't compress SSE or WebSocket upgrade responses
    if (req.headers['accept'] === 'text/event-stream') return false;
    return compression.filter(req, res);
  },
});

export default compressionMiddleware;
