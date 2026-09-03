import { approveRequest } from "./approval.js";

const requestId = process.argv[2];
if (!requestId) {
  console.error("Usage: npm run admin:approve -- <access_request_id>");
  process.exit(1);
}

try {
  const { request, link, expiresAt, delivered } = await approveRequest(requestId);
  if (delivered) {
    console.log(`Approved. Link auto-sent to ${request.contactType}:${request.contactValue}`);
  } else {
    console.log(`Approved. Send this link to ${request.contactType}:${request.contactValue}`);
  }
  console.log(link);
  console.log(`Expires: ${expiresAt.toISOString()}`);
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
