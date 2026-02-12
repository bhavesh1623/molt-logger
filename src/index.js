const path = require("path");
const fs = require("fs");
const pino = require("pino");

/**
 * Wrap a Pino logger so NestJS Logger API works: .log() -> .info(), .verbose() -> .debug().
 * Also wraps .child() so child loggers have the same methods (and still write to MongoDB).
 */
function wrapForNest(logger) {
  if (logger.log && logger.verbose) return logger;
  const wrapped = Object.create(logger);
  wrapped.log = function log(...args) {
    return logger.info.apply(logger, args);
  };
  wrapped.verbose = function verbose(...args) {
    return logger.debug.apply(logger, args);
  };
  const origChild = logger.child.bind(logger);
  wrapped.child = function child(bindings) {
    return wrapForNest(origChild(bindings));
  };
  return wrapped;
}

/**
 * Default MongoDB for all microservices' logs. Read by logger-client-node from env;
 * microservices do not pass URI in code. Set LOG_MONGODB_URI (or MONGODB_URI) in your
 * environment once; same value for every service.
 */
function getLogsMongoUri(options) {
  return options.uri || process.env.LOG_MONGODB_URI || process.env.MONGODB_URI;
}

/**
 * True when running in local/dev mode: no MongoDB, logs to stdout and optionally to a file.
 */
function isLocalMode(options) {
  return (
    options.local === true ||
    process.env.LOG_TO_MONGO === "false" ||
    process.env.NODE_ENV === "development"
  );
}

/**
 * Create a Pino logger. In production writes to the central logs MongoDB (batched).
 * In local/development (NODE_ENV=development or LOG_TO_MONGO=false) writes only to stdout
 * and optionally to a file (LOG_FILE or options.logFile); no database.
 *
 * @param {object} options
 * @param {string} [options.uri] - Override: MongoDB URI for logs (optional; prefer LOG_MONGODB_URI in env)
 * @param {string} options.service - Service name (e.g. 'gym', 'users') — only required param in app code
 * @param {boolean} [options.local] - Force local mode: no MongoDB, use stdout/file only
 * @param {string} [options.logFile] - File path for logs in local mode (or set LOG_FILE in env)
 * @param {string} [options.database] - Override: database name (optional; prefer LOG_DATABASE in env)
 * @param {string} [options.collection='logs'] - Override: collection name (optional; prefer LOG_COLLECTION)
 * @param {number} [options.batchSize=50] - Flush after N logs
 * @param {number} [options.flushMs=5000] - Flush after N ms
 * @returns {pino.Logger} Logger with .info(), .warn(), .error(), .log() (alias info), .verbose() (alias debug)
 */
function createLogger(options = {}) {
  const service = options.service || process.env.LOG_SERVICE || "app";
  const localMode = isLocalMode(options);

  let dest;
  if (localMode) {
    const streams = [];
    if (options.stdout !== false) streams.push({ stream: process.stdout });
    const logFile = options.logFile || process.env.LOG_FILE;
    if (logFile) {
      const dir = path.dirname(logFile);
      try {
        fs.mkdirSync(dir, { recursive: true });
      } catch (_) {}
      streams.push({ stream: pino.destination(logFile, { append: true }) });
    }
    dest =
      streams.length > 1
        ? pino.multistream(streams)
        : streams[0]?.stream || process.stdout;
  } else {
    const transportPath = path.join(__dirname, "mongo-transport.js");
    const transport = pino.transport({
      target: transportPath,
      options: {
        uri: getLogsMongoUri(options),
        service,
        database: options.database || process.env.LOG_DATABASE,
        collection: options.collection || process.env.LOG_COLLECTION || "logs",
        batchSize: options.batchSize,
        flushMs: options.flushMs,
      },
    });
    dest =
      options.stdout !== false
        ? pino.multistream([{ stream: process.stdout }, { stream: transport }])
        : transport;
  }

  const logger = pino(
    {
      level: process.env.LOG_LEVEL || "info",
      ...options.pino,
    },
    dest,
  );
  return wrapForNest(logger);
}

const { requestLoggerMiddleware } = require("./request-logger");

module.exports = {
  createLogger,
  pino,
  wrapForNest,
  getLogsMongoUri,
  isLocalMode,
  requestLoggerMiddleware,
};
