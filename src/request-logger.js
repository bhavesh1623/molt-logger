/**
 * Express middleware: log every request with endpoint, request details, and response details.
 * Attach your logger (from createLogger) to req.app.locals.logger or pass as option.
 *
 * Log document will include: endpoint (e.g. "POST /coach/register"), request (method, path, query, body?), response (statusCode, durationMs).
 */

function sanitizeBody(body, maxLength = 2000) {
  if (body == null) return undefined;
  if (typeof body !== "object") return String(body).slice(0, maxLength);
  try {
    const str = JSON.stringify(body);
    return str.length > maxLength ? str.slice(0, maxLength) + "..." : str;
  } catch (_) {
    return "[non-serializable]";
  }
}

/**
 * @param {object} options
 * @param {object} options.logger - Pino logger (from createLogger). If not set, uses req.app.locals.logger.
 * @param {boolean} [options.includeBody=true] - Include request body in request details (sanitized, truncated).
 * @param {boolean} [options.includeHeaders=false] - Include request headers (e.g. authorization will be redacted).
 * @param {number} [options.bodyMaxLength=2000] - Max length for body in logs.
 * @param {string[]} [options.redactHeaders=['authorization', 'cookie']] - Header keys to redact.
 */
function requestLoggerMiddleware(options = {}) {
  const {
    logger: optsLogger,
    includeBody = true,
    includeHeaders = false,
    bodyMaxLength = 2000,
    redactHeaders = ["authorization", "cookie"],
  } = options;

  return function middleware(req, res, next) {
    const start = Date.now();
    const reqId =
      req.id ||
      req.headers?.["x-request-id"] ||
      `req-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    req.id = reqId;

    res.on("finish", () => {
      const logger = optsLogger || req.app?.locals?.logger;
      if (!logger) return;

      const method = req.method || "?";
      const path = req.originalUrl?.split("?")[0] || req.path || "/";
      const endpoint = `${method} ${path}`;
      const durationMs = Date.now() - start;

      const requestDetails = {
        method,
        path,
        query: Object.keys(req.query || {}).length ? req.query : undefined,
      };
      if (includeBody && req.body !== undefined) {
        requestDetails.body = sanitizeBody(req.body, bodyMaxLength);
      }
      if (includeHeaders && req.headers) {
        const headers = { ...req.headers };
        redactHeaders.forEach((key) => {
          const k = key.toLowerCase();
          if (headers[k] != null) headers[k] = "[redacted]";
        });
        requestDetails.headers = headers;
      }

      const responseDetails = {
        statusCode: res.statusCode,
        durationMs,
      };

      const level =
        res.statusCode >= 500
          ? "error"
          : res.statusCode >= 400
            ? "warn"
            : "info";
      const message = `${method} ${path} ${res.statusCode} ${durationMs}ms`;

      logger[level](
        {
          reqId,
          endpoint,
          request: requestDetails,
          response: responseDetails,
        },
        message,
      );
    });
    next();
  };
}

module.exports = { requestLoggerMiddleware, sanitizeBody };
