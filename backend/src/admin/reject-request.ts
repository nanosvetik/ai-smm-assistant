import { rejectRequest } from "./approval.js";

const requestId = process.argv[2];
if (!requestId) {
  console.error("Usage: npm run admin:reject -- <access_request_id>");
  process.exit(1);
}

try {
  await rejectRequest(requestId);
  console.log(`Rejected ${requestId}`);
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
