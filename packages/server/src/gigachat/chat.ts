import { config } from '../config.js';
import { getAccessToken } from './auth.js';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ChatResponse {
  choices: Array<{
    message: {
      role: string;
      content: string;
    };
    index: number;
    finish_reason: string;
  }>;
  model: string;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * Send a chat completion request to GigaChat.
 * Used for content classification, entity extraction, query routing.
 */
export async function chatCompletion(
  messages: ChatMessage[],
  options: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
  } = {}
): Promise<string> {
  const token = await getAccessToken();
  const { model = 'GigaChat', temperature = 0.1, maxTokens = 2048 } = options;

  const response = await fetch(`${config.gigachat.apiUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`GigaChat chat failed (${response.status}): ${text}`);
  }

  const data = (await response.json()) as ChatResponse;
  return data.choices[0].message.content;
}
