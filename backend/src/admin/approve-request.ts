import "../lib/loadEnv.js";

const requestId = process.argv[2];
if (!requestId) {
  console.error("Usage: npm run admin:approve -- <access_request_id>");
  process.exit(1);
}

// Динамический импорт обязателен: approval.ts тянет за собой базу и почту,
// которые читают переменные окружения при загрузке. Статический импорт
// выполнился бы до loadEnv, и скрипт работал бы с localhost-ссылкой,
// выключенной почтой и, возможно, не с той базой, что у сервера.
const { approveRequest } = await import("./approval.js");

try {
  const { request, link, expiresAt, delivered } = await approveRequest(requestId);
  if (delivered) {
    console.log(`Approved. Link auto-sent to ${request.contactValue}`);
  } else {
    console.log(`Approved. Send this link to ${request.contactValue}`);
  }
  console.log(link);
  console.log(`Expires: ${expiresAt.toISOString()}`);
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
