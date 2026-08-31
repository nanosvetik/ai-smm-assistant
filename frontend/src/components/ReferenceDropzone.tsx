import { useRef, useState } from "react";
import type { DragEvent } from "react";
import { REFERENCE_CATEGORIES, uploadReference, type ReferenceCategory, type ReferenceFile } from "../lib/api";
import "./ReferenceDropzone.css";

const CATEGORY_LABELS: Record<ReferenceCategory, string> = {
  before_after: "До / после",
  workspace: "Кабинет",
  showcase: "Витрина",
  products: "Товары",
  process: "Процесс работы",
};

interface ReferenceDropzoneProps {
  references: ReferenceFile[];
  onUploaded: (file: ReferenceFile) => void;
}

function CategoryZone({
  category,
  files,
  onUploaded,
}: {
  category: ReferenceCategory;
  files: ReferenceFile[];
  onUploaded: (file: ReferenceFile) => void;
}) {
  const [isOver, setIsOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    setIsUploading(true);
    setError(null);
    try {
      for (const file of Array.from(fileList)) {
        const uploaded = await uploadReference(category, file);
        onUploaded({ ...uploaded, originalFilename: file.name });
      }
    } catch {
      setError("Не удалось загрузить файл. Попробуйте ещё раз.");
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <div
      className={`reference-zone ${isOver ? "reference-zone-over" : ""}`}
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
      <span className="reference-zone-label">{CATEGORY_LABELS[category]}</span>
      {files.length > 0 && <span className="reference-zone-count">{files.length}</span>}
      {isUploading && <span className="reference-zone-status">Загружаем…</span>}
      {error && <span className="reference-zone-error">{error}</span>}
    </div>
  );
}

export function ReferenceDropzone({ references, onUploaded }: ReferenceDropzoneProps) {
  return (
    <div className="reference-dropzone">
      <label className="reference-dropzone-label">Фото для рилсов и постов</label>
      <p className="reference-dropzone-hint">
        Кабинет, витрина, товары, «до/после» — что угодно, что показывает вашу работу. Необязательно, но с фото
        сценарии получаются точнее.
      </p>
      <div className="reference-dropzone-grid">
        {REFERENCE_CATEGORIES.map((category) => (
          <CategoryZone
            key={category}
            category={category}
            files={references.filter((r) => r.category === category)}
            onUploaded={onUploaded}
          />
        ))}
      </div>
    </div>
  );
}
