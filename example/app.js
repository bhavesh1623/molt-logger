const { createLogger } = require("../src/index");

const logger = createLogger({
  service: "example-app",
  local: true,
});

logger.info("Molt Logger running!");
logger.info({ user: "demo", action: "start" }, "Example log with metadata");
logger.warn("Sample warning");
logger.error("Sample error");

console.log("\n✓ Logger demo complete.");
