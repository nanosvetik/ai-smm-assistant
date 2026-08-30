// views — доступны на обеих площадках; likes/reposts — только VK (публичное
// превью Telegram их не показывает). Нужны для ранжирования по вовлечённости
// в competitor-analyzer (раздел 3 спецификации, Шаг 3).
export interface PostEngagement {
  views?: number;
  likes?: number;
  reposts?: number;
}

export interface ParsedPost {
  text: string;
  date: Date;
  url: string;
  engagement: PostEngagement;
}
