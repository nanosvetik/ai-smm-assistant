import { useEffect, useState } from "react";
import { ApiError, generateVideo, getGeneratedVideo, runAgent, type GeneratedVideo } from "../lib/api";
import { Button } from "./Button";
import "./ImageGenerationBlock.css";

// Зеркало ImageGenerationBlock.tsx для Reels: одна кнопка молча пишет
// видео-промпт (POST /agents/reels-video-generator — визуализация хука, см.
// prompts/reels-video-generator.md) и сразу вызывает реальную генерацию
// (generate_video) — клиент не видит ни английского промпта, ни модели/цены,
// только готовое видео. Не завязан на onRun родителя (в отличие от
// ImageGenerationBlock): галочка «пройдено» для этапа «Рилсы» и так зависит
// от самого сценария reels-writer (видимого RunBlock выше), не от видео-
// промпта — этому блоку не нужно поднимать состояние в DashboardScreen.
// Видео дольше картинки (~1–3 минуты, не десятки секунд), отдельный текст ожидания.
export function VideoGenerationBlock() {
  const [video, setVideo] = useState<GeneratedVideo | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setIsLoaded(false);
    getGeneratedVideo().then((result) => {
      setVideo(result);
      setIsLoaded(true);
    });
  }, []);

  async function handleGenerate() {
    setIsGenerating(true);
    setError(null);
    try {
      await runAgent("reels-video-generator");
      const result = await generateVideo();
      setVideo(result);
    } catch (err) {
      if (err instanceof ApiError && err.missing && err.missing.length > 0) {
        setError("Сначала должен появиться готовый сценарий рилса.");
      } else {
        setError("Не получилось сгенерировать видео. Попробуйте ещё раз.");
      }
    } finally {
      setIsGenerating(false);
    }
  }

  if (!isLoaded) return null;

  const extension = video?.publicUrl.split(".").pop() ?? "mp4";

  return (
    <div className="image-generation-block">
      {video && (
        <div className="image-generation-preview">
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video src={video.publicUrl} controls />
        </div>
      )}
      <div className="image-generation-actions">
        {video && (
          <a className="btn btn-primary image-generation-download" href={video.publicUrl} download={`видео-хук.${extension}`}>
            Скачать видео
          </a>
        )}
        {/* Без повторной генерации — решение сессии 2026-09-02: видео
            заметно дороже картинки ($0.84 против $0.04 за вызов), «Сгенерировать
            заново» здесь не оставляем, в отличие от ImageGenerationBlock.tsx. */}
        {!video && (
          <Button type="button" variant="primary" onClick={handleGenerate} disabled={isGenerating}>
            {isGenerating ? "Генерируем…" : "Сгенерировать видео"}
          </Button>
        )}
      </div>
      {isGenerating && (
        <p className="image-generation-hint">Готовим видео — обычно 1–3 минуты. Не закрывайте вкладку.</p>
      )}
      {error && <p className="stage-error">{error}</p>}
    </div>
  );
}
