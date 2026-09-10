// navigator.clipboard существует только в защищённом контексте: по https или
// на localhost. По http с адреса сервера его нет вовсе, а сам вызов может
// отклониться, если вкладка потеряла фокус. Возвращаем признак успеха, чтобы
// интерфейс не показывал «Скопировано» там, где ничего не скопировалось.
export async function copyText(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // падаем в запасной путь ниже
    }
  }

  // execCommand устарел, но работает без защищённого контекста и остаётся
  // единственным способом скопировать текст, пока сертификат не выпущен.
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.select();
  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    area.remove();
  }
}
