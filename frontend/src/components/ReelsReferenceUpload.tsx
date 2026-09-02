import { useEffect, useRef, useState } from "react";
import type { DragEvent } from "react";
import { getReelsReferences, uploadReelsReference, type ReelsReferenceFile } from "../lib/api";
import "./ReelsReferenceUpload.css";

// Референсы для конкретного рилса — показывается только после того, как
// сценарий уже готов (см. StagePanel.tsx), клиент добавляет фото, которые
// подходят именно к этому сценарию. Одна простая зона загрузки, без категорий
// (в отличие от прежнего онбордингового ReferenceDropzone). Пока только
// хранение — не участвует ни в анализе стиля, ни в самой генерации видео,
// об этом честно сказано в подсказке под зоной.
export function ReelsReferenceUpload() {
  const [references, setReferences] = useState<ReelsReferenceFile[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isOver, setIsOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getReelsReferences().then((result) => {
      setReferences(result);
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
    } catch {
      setError("Не удалось загрузить файл. Попробуйте ещё раз.");
    } finally {
      setIsUploading(false);
    }
  }

  if (!isLoaded) return null;

  return (
    <div className="reels-reference-upload">
      <h2>Фото для этого рилса</h2>
      <p className="reels-reference-hint">
        Если есть кадры, которые подходят к этому сценарию — добавьте их. Необязательно. Пока фото только
        сохраняются при клиенте — в самой генерации видео они не участвуют.
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
          accept="image/*"
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
            <span key={ref.id} className="reels-reference-file">
              {ref.originalFilename}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
