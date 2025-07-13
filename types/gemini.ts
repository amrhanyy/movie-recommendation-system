export interface GeminiPart {
  text: string;
}

export interface GeminiContent {
  parts: GeminiPart[];
  role?: string;
}

export interface GeminiMessage {
  contents: GeminiContent[];
}

export interface GeminiResponse {
  candidates: {
    content: {
      parts: {
        text: string;
      }[];
      role?: string;
    };
    finishReason: string;
    index: number;
    safetyRatings: {
      category: string;
      probability: string;
    }[];
  }[];
  promptFeedback?: {
    safetyRatings: {
      category: string;
      probability: string;
    }[];
  };
} 