import { useEffect, useRef, useState } from "react";
import type { DragEvent } from "react";
import { ApiError, deleteReelsReference, getReelsReferences, uploadReelsReference, type ReelsReferenceFile } from "../lib/api";
import "./ReelsReferenceUpload.css";

// Референсы для конкретного рилса — показывается только после того, как
// сценарий уже готов (см. StagePanel.tsx), клиент добавляет фото, которые
// подходят именно к этому сценарию. Одна простая зона загрузки, без категорий
// (в отличие от прежнего онбордингового ReferenceDropzone). Загруженное идёт
// в дело дважды: самое свежее фото уходит видео-модели первым кадром, а весь
// набор разбирает visual-style-analyzer — с него промпт к видео берёт стиль.
export function ReelsReferenceUpload() {
  const [references, setReferences] = useState<ReelsReferenceFile[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isOver, setIsOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getReelsReferences()
      .then((result) => {
        setReferences(result);
        setIsLoaded(true);
      })
      // Без перехвата зона загрузки исчезала вместе с подсказкой: клиент не
      // видел ни своих файлов, ни возможности добавить новые.
      .catch(() => {
        setError("Не удалось загрузить список фото. Обновите страницу.");
        setIsLoaded(true);
      });
  }, []);

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    setIsUploading(true);
    setError(null);
    try {
      for (const file of Array.from(fileList)) {
        const uploaded = await uploadReelsReference(file);
        setReferences((r) => [...r, uploaded]);
      }
    } catch (err) {
      // Отказ по формату повтором не лечится — предлагать «попробуйте ещё раз»
      // здесь значит отправить человека по кругу.
      if (err instanceof ApiError && err.status === 415) {
        setError("Такой формат не подойдёт. Нужен JPG, PNG, WEBP или GIF.");
      } else if (err instanceof ApiError && err.status === 413) {
        setError("Файл больше 20 МБ. Уменьшите фото или выберите другое.");
      } else {
        setError("Не удалось загрузить файл. Попробуйте ещё раз.");
      }
    } finally {
      setIsUploading(false);
      // Сброс значения обязателен: без него повторный выбор файла с тем же
      // именем не вызывает событие change — а подсказка выше прямо предлагает
      // «удалить и загрузить заново», то есть ровно этот сценарий.
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    setError(null);
    try {
      await deleteReelsReference(id);
      setReferences((r) => r.filter((ref) => ref.id !== id));
    } catch {
      setError("Не удалось удалить фото. Попробуйте ещё раз.");
    } finally {
      setDeletingId(null);
    }
  }

  if (!isLoaded) return null;

  return (
    <div className="reels-reference-upload">
      <h2>Фото для этого рилса</h2>
      <p className="reels-reference-hint">
        Если есть кадры, которые подходят к этому сценарию — добавьте их. Необязательно. Самое свежее фото
        используется как стартовый кадр видео: модель продолжает сцену с него, а не выдумывает всё с нуля. Если
        фото несколько — стартовым станет последнее загруженное, а по остальным мы поймём ваш стиль: свет,
        цвета, характер съёмки. Загруженное можно удалить и загрузить заново, если передумали.
      </p>
      <div
        className={`reels-reference-zone ${isOver ? "reels-reference-zone-over" : ""}`}
        onDragOver={(e: DragEvent) => {
          e.preventDefault();
          setIsOver(true);
        }}
        onDragLeave={() => setIsOver(false)}
        onDrop={(e: DragEvent) => {
          e.preventDefault();
          setIsOver(false);
          handleFiles(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          multiple
          hidden
          onChange={(e) => handleFiles(e.target.files)}
        />
        <span className="reels-reference-zone-label">Перетащите фото сюда или нажмите, чтобы выбрать</span>
        {isUploading && <span className="reels-reference-zone-status">Загружаем…</span>}
      </div>
      {error && <p className="reels-reference-error">{error}</p>}
      {references.length > 0 && (
        <div className="reels-reference-grid">
          {references.map((ref) => (
            <div key={ref.id} className="reels-reference-thumb">
              <img src={ref.publicUrl} alt={ref.originalFilename} />
              <button
                type="button"
                className="reels-reference-remove"
                onClick={() => handleDelete(ref.id)}
                disabled={deletingId === ref.id}
                aria-label={`Удалить ${ref.originalFilename}`}
                title="Удалить"
              >
                {deletingId === ref.id ? "…" : "✕"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
