import type { Platform, SocialLink } from "../lib/api";
import "./LinksField.css";

interface LinksFieldProps {
  label: string;
  hint?: string;
  links: SocialLink[];
  onChange: (links: SocialLink[]) => void;
  min?: number;
  max: number;
}

const EMPTY_LINK: SocialLink = { platform: "telegram", url: "" };

export function LinksField({ label, hint, links, onChange, min = 0, max }: LinksFieldProps) {
  function updateLink(index: number, patch: Partial<SocialLink>) {
    onChange(links.map((link, i) => (i === index ? { ...link, ...patch } : link)));
  }

  function removeLink(index: number) {
    onChange(links.filter((_, i) => i !== index));
  }

  function addLink() {
    onChange([...links, { ...EMPTY_LINK }]);
  }

  return (
    <div className="links-field">
      <label className="links-field-label">{label}</label>
      {hint && <p className="links-field-hint">{hint}</p>}

      {links.map((link, index) => (
        <div className="links-field-row" key={index}>
          <select
            value={link.platform}
            onChange={(e) => updateLink(index, { platform: e.target.value as Platform })}
            aria-label="Площадка"
          >
            <option value="telegram">Telegram</option>
            <option value="vk">ВК</option>
          </select>
          <input
            type="url"
            placeholder="https://..."
            value={link.url}
            onChange={(e) => updateLink(index, { url: e.target.value })}
            aria-label="Ссылка"
          />
          {links.length > min && (
            <button type="button" className="links-field-remove" onClick={() => removeLink(index)} aria-label="Убрать ссылку">
              ✕
            </button>
          )}
        </div>
      ))}

      {links.length < max && (
        <button type="button" className="links-field-add" onClick={addLink}>
          + Добавить ссылку
        </button>
      )}
    </div>
  );
}
