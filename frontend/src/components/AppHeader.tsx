import { BRAND_NAME } from "../lib/brand";
import "./AppHeader.css";

// Бренд в рабочих экранах. До этого онбординг и кабинет открывались сразу с
// формы или сайдбара: человек приходит по ссылке из почты и не видит, куда
// попал. Это хром, не содержание — поэтому тихо и без действий.
export function AppHeader() {
  return (
    <header className="app-header">
      <span className="app-header-brand">
        <span className="app-header-mark" aria-hidden="true">
          „
        </span>
        {BRAND_NAME}
      </span>
    </header>
  );
}
