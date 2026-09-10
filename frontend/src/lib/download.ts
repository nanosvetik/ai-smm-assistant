// Общий способ отдать пользователю файл, собранный прямо в браузере: текст
// поста и выгрузка контент-плана в .xlsx. Две детали, без которых скачивание
// иногда молча не начинается:
// - ссылка добавляется в документ, потому что часть браузеров игнорирует клик
//   по элементу вне DOM;
// - объектный URL освобождается с задержкой, а не сразу после click(): отзыв в
//   том же кадре обрывает уже начавшуюся загрузку в Firefox и Safari.
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
