const fs = require("fs");
const path = require("path");

const root = process.cwd();
const failures = [];

function read(relPath) {
  return fs.readFileSync(path.join(root, relPath), "utf8");
}

function mustMatch(relPath, pattern, message) {
  const text = read(relPath);
  if (!pattern.test(text)) failures.push(`${relPath}: ${message}`);
}

const rules = JSON.parse(read("database.rules.json"));
const presenceRules = rules.rules?.non_s_presence || {};

if (JSON.stringify(presenceRules[".indexOn"]) !== JSON.stringify(["t"])) {
  failures.push("database.rules.json: non_s_presence must index t");
}

if (!String(presenceRules[".read"] || "").includes("query.limitToLast <= 500")) {
  failures.push("database.rules.json: non_s_presence reads must require a bounded query");
}

if (String(presenceRules[".read"] || "").trim() === "auth != null") {
  failures.push("database.rules.json: non_s_presence must not allow unbounded authenticated reads");
}

const uidRules = presenceRules.$uid || {};
if (!String(uidRules[".write"] || "").includes("now - 120000")) {
  failures.push("database.rules.json: stale presence cleanup must be time-bound");
}
if (uidRules.$other?.[".validate"] !== false) {
  failures.push("database.rules.json: presence nodes must reject unexpected children");
}

mustMatch("script.js", /const PRESENCE_TTL_MS = 120000;/, "presence TTL must be explicit");
mustMatch("script.js", /const PRESENCE_HEARTBEAT_MS = 45000;/, "presence heartbeat must be explicit");
mustMatch("script.js", /const PRESENCE_MAX_VIEWERS = 500;/, "presence read limit must be explicit");
mustMatch("script.js", /function createSessionId\(\)/, "session IDs must use an explicit generator");
mustMatch("script.js", /crypto\.getRandomValues\(bytes\)/, "session ID fallback must use Web Crypto when randomUUID is unavailable");
mustMatch("script.js", /\.orderByChild\('t'\)\s*\.startAt\(Date\.now\(\) - PRESENCE_TTL_MS\)\s*\.limitToLast\(PRESENCE_MAX_VIEWERS\)/s, "presence reads must use indexed bounded queries");
mustMatch("script.js", /setInterval\(subscribePresence, PRESENCE_TTL_MS\)/, "presence query must refresh its TTL window");
mustMatch("script.js", /setInterval\(\(\) => \{\s*writeHeartbeat\(\)\.catch/s, "presence heartbeat must refresh active sessions");
mustMatch("script.js", /visitorRef\.remove\(\)\.catch\(\(\) => \{\}\)/, "presence should remove the visitor on pagehide");
mustMatch("script.js", /drops = Array\.from\(\{ length: nextCols \}/, "matrix columns must resize with the viewport");

mustMatch(".github/workflows/quality.yml", /check-nons-production\.js/, "quality workflow must run Non-s production checks");
mustMatch("scripts/check-repo-contracts.js", /check-nons-production\.js/, "repo contracts must require Non-s production checks");

if (/Math\.random\(\)\.toString\(36\)/.test(read("script.js"))) {
  failures.push("script.js: production path must not use Math.random for session identity");
}

if (failures.length) {
  console.error("NONS_PRODUCTION_CHECK_FAILED");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("NONS_PRODUCTION_CHECK_OK");
