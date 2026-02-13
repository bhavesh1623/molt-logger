const { Writable } = require("stream");
const { MongoClient } = require("mongodb");

const LEVEL_MAP = {
  10: "trace",
  20: "debug",
  30: "info",
  40: "warn",
  50: "error",
  60: "fatal",
};

const BATCH_SIZE = parseInt(process.env.LOG_BATCH_SIZE, 10) || 50;
const FLUSH_MS = parseInt(process.env.LOG_FLUSH_MS, 10) || 2000;

function pinoToDoc(line, service) {
  const obj = typeof line === "string" ? JSON.parse(line) : line;
  const {
    level,
    msg,
    time,
    reqId,
    userId,
    endpoint,
    request: reqDetails,
    response: resDetails,
    ...rest
  } = obj;
  const doc = {
    level: LEVEL_MAP[level] || "info",
    message: msg ?? (typeof rest.msg === "string" ? rest.msg : ""),
    service,
    source: "logger-client-node",
    storage: "mongodb",
    storageTags: ["mongodb"],
    timestamp: time != null ? new Date(time) : new Date(),
  };
  if (reqId != null) doc.reqId = String(reqId);
  if (userId != null) doc.userId = String(userId);
  if (endpoint != null) doc.endpoint = String(endpoint);
  if (reqDetails != null && typeof reqDetails === "object")
    doc.request = reqDetails;
  if (resDetails != null && typeof resDetails === "object")
    doc.response = resDetails;
  if (Object.keys(rest).length > 0) doc.meta = rest;
  return doc;
}

module.exports = async function buildTransport(opts) {
  const {
    uri = process.env.LOG_MONGODB_URI || process.env.MONGODB_URI,
    database = process.env.LOG_DATABASE,
    collection = process.env.LOG_COLLECTION || "logs",
    service = process.env.LOG_SERVICE || "app",
    batchSize = BATCH_SIZE,
    flushMs = FLUSH_MS,
  } = opts || {};

  if (!uri)
    throw new Error(
      "MongoDB URI for logs required: set LOG_MONGODB_URI (or MONGODB_URI) in environment",
    );

  const client = new MongoClient(uri);
  await client.connect();
  const dbName = database || client.db().databaseName;
  const col = client.db(dbName).collection(collection);

  const buffer = [];
  let flushTimer = null;

  function flush() {
    if (buffer.length === 0) return;
    const docs = buffer.splice(0, buffer.length);
    col.insertMany(docs, { ordered: false }).catch((err) => {
      process.stderr.write(
        `[logger-client-node] MongoDB insertMany failed: ${err.message}\n`,
      );
      process.stderr.write(
        `[logger-client-node] Check LOG_MONGODB_URI and network. Full error: ${err.stack || err}\n`,
      );
    });
  }

  function scheduleFlush() {
    if (flushTimer) return;
    flushTimer = setTimeout(() => {
      flushTimer = null;
      flush();
    }, flushMs);
  }

  const writable = new Writable({
    objectMode: false,
    write(chunk, _enc, cb) {
      const str = chunk.toString();
      const lines = str.split("\n").filter((s) => s.trim());
      for (const line of lines) {
        try {
          buffer.push(pinoToDoc(line, service));
        } catch (_) {
          // skip malformed lines
        }
      }
      if (buffer.length >= batchSize) {
        flush();
        if (flushTimer) clearTimeout(flushTimer);
        flushTimer = null;
      } else {
        scheduleFlush();
      }
      cb();
    },
    final(cb) {
      if (flushTimer) clearTimeout(flushTimer);
      flush();
      client.close().then(() => cb(), cb);
    },
  });

  return writable;
};
