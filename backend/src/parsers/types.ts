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

// Шапка профиля — для аудита оформления (profile-header-analyzer), не для
// анализа контента. coverUrl — только VK, у Telegram-канала нет обложки.
export interface ProfileHeader {
  name?: string;
  avatarUrl?: string;
  coverUrl?: string;
  description?: string;
}
