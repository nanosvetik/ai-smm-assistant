import { useEffect, useState } from "react";
import { ApiError, generateImage, getGeneratedImage, type GeneratedImage, type Platform } from "../lib/api";
import { Button } from "./Button";
import "./ImageGenerationBlock.css";

interface ImageGenerationBlockProps {
  platform: Platform;
  // Пишет свежий промпт (POST /agents/visual-generator) — тот же onRun, что
  // обновляет results в DashboardScreen (галочка «пройдено» в сайдбаре
  // остаётся завязана на факт наличия промпта). Промпт клиенту не
  // показываем — вызывается молча внутри handleGenerate, единой кнопкой с
  // самой генерацией картинки.
  onGeneratePrompt: () => Promise<void>;
}

// Единственный элемент управления на вкладке «Изображения»: один клик молча
// пишет промпт и сразу вызывает реальную генерацию (generate_image) — клиент
// не видит ни английского промпта, ни модели/цены, только готовую
// иллюстрацию: техническая кухня клиенту не нужна — тот же принцип, по
// которому от него скрыт служебный заголовок документов.
export function ImageGenerationBlock({ platform, onGeneratePrompt }: ImageGenerationBlockProps) {
  const [image, setImage] = useState<GeneratedImage | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setIsLoaded(false);
    setLoadFailed(false);
    getGeneratedImage(platform)
      .then((result) => {
        setImage(result);
        setIsLoaded(true);
      })
      // Без перехвата блок навсегда оставался бы в состоянии «ещё грузится» и
      // возвращал null: этап выглядел бы пустым — ни кнопки, ни объяснения.
      .catch(() => {
        setLoadFailed(true);
        setIsLoaded(true);
      });
  }, [platform]);

  async function handleGenerate() {
    setIsGenerating(true);
    setError(null);
    try {
      await onGeneratePrompt();
      const result = await generateImage(platform);
      setImage(result);
    } catch (err) {
      if (err instanceof ApiError && err.missing && err.missing.length > 0) {
        setError("Сначала должен появиться готовый текст поста для этой площадки.");
      } else {
        setError("Не получилось сгенерировать картинку. Попробуйте ещё раз.");
      }
    } finally {
      setIsGenerating(false);
    }
  }

  if (!isLoaded) return null;

  // Кнопки генерации здесь намеренно нет: неизвестно, есть ли уже готовая
  // картинка, и клик оплатил бы вторую поверх существующей.
  if (loadFailed) {
    return (
      <div className="image-generation-block">
        <p className="stage-error">Не удалось проверить, есть ли уже готовая картинка. Обновите страницу.</p>
      </div>
    );
  }

  // Расширение из реального файла (jpg/png/webp — зависит от того, что вернула
  // модель) — не жёстко .jpg, скачанный файл должен реально открываться.
  const extension = image?.publicUrl.split(".").pop() ?? "jpg";

  return (
    <div className="image-generation-block">
      {image && (
        <div className="image-generation-preview">
          <img src={image.publicUrl} alt="Иллюстрация к посту" />
        </div>
      )}
      <div className="image-generation-actions">
        {image && (
          <a
            className="btn btn-primary image-generation-download"
            href={image.publicUrl}
            download={`иллюстрация-${platform}.${extension}`}
          >
            Скачать картинку
          </a>
        )}
        <Button
          type="button"
          variant={image ? "quiet" : "primary"}
          onClick={handleGenerate}
          disabled={isGenerating}
        >
          {isGenerating ? "Генерируем…" : image ? "Сгенерировать заново" : "Сгенерировать картинку"}
        </Button>
      </div>
      {isGenerating && (
        <p className="image-generation-hint">Готовим иллюстрацию — обычно меньше минуты. Не закрывайте вкладку.</p>
      )}
      {error && <p className="stage-error">{error}</p>}
    </div>
  );
}
