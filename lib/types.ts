export type ChatMessage = {
  role: 'user' | 'assistant' | 'system';
  content: string;
  modelId?: string; // which model produced this assistant message
  ts?: number;
};

export type AiModel = {
  id: string; // unique key in UI
  label: string; // display name
  provider: 'gemini' | 'openrouter';
  model: string; // provider-specific model id
  free?: boolean;
  good?: boolean; // highlight as recommended
};

export type ApiKeys = {
  gemini?: string;
  openrouter?: string;
};

export type ChatThread = {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
};
