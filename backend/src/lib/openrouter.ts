const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

// content как массив блоков — для мультимодальных сообщений (vision), см.
// backend/src/agents/visualStyleAnalyzer.ts. Формат совместим с OpenAI chat
// completions image_url (data: URI или публичный HTTP(S) URL).
export interface TextContentBlock {
  type: "text";
  text: string;
}

export interface ImageContentBlock {
  type: "image_url";
  image_url: { url: string };
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string | Array<TextContentBlock | ImageContentBlock>;
}

export async function chatCompletion(model: string, messages: ChatMessage[]): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not set");
  }

  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model, messages }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenRouter request failed (${res.status}): ${body}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new Error(`OpenRouter response missing choices[0].message.content: ${JSON.stringify(data)}`);
  }
  return content;
}
