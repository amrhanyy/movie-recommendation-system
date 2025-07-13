import { NextResponse } from "next/server";
import type { GeminiResponse } from "@/types/gemini";

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

async function getGeminiResponse(currentMessage: string, previousMessages: ChatMessage[] = []) {
  if (!GOOGLE_API_KEY) {
    throw new Error("GOOGLE_API_KEY is not configured");
  }

  try {
    // Prepare message history for the Gemini API
    const messageParts = [];
    
    // System message always comes first
    messageParts.push({
      text: "be friendly and helpful. You are a helpful AI assistant specialized in movies and TV shows. Please provide information, recommendations, and answer questions related only to films and television. Do not discuss topics outside of these areas.make your answers in markdown format"
    });
    
    // Add previous messages in chronological order
    for (const msg of previousMessages) {
      messageParts.push({
        text: `${msg.role === 'user' ? 'User: ' : 'Assistant: '}${msg.content}`
      });
    }
    
    // Add the current message
    messageParts.push({
      text: `User: ${currentMessage}`
    });
    
    console.log('Making request to Google Gemini API with conversation history');
    
    const response = await fetch(`${API_URL}?key=${GOOGLE_API_KEY}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        contents: [{
          parts: messageParts
        }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 1000,
          topP: 0.95,
          topK: 40
        }
      }),
    });

    // Check response status
    if (!response.ok) {
      const errorText = await response.text();
      console.error("Google API Error Response:", {
        status: response.status,
        statusText: response.statusText,
        body: errorText
      });
      throw new Error(`API error ${response.status}: ${errorText}`);
    }

    const data: GeminiResponse = await response.json();
    console.log('Google API Response:', JSON.stringify(data, null, 2));

    // Extract content from Google API response
    let content = '';
    if (data.candidates && data.candidates.length > 0 && data.candidates[0].content) {
      const parts = data.candidates[0].content.parts;
      if (parts && parts.length > 0) {
        content = parts[0].text || '';
      }
    }

    if (!content) {
      console.error("Invalid API Response Format:", data);
      throw new Error("Invalid response format from API");
    }

    // Remove any "Assistant: " prefix that might be in the response
    if (content.startsWith('Assistant: ')) {
      content = content.substring('Assistant: '.length);
    }

    return content;
  } catch (error) {
    console.error("Google Gemini request error:", error);
    throw error;
  }
}

export async function POST(request: Request) {
  try {
    const { message, previousMessages } = await request.json();
    console.log('Processing chat request for message:', message);

    if (!message?.trim()) {
      return NextResponse.json(
        { error: "Message is required" },
        { status: 400 }
      );
    }

    const responseText = await getGeminiResponse(message, previousMessages || []);
    console.log('Successfully generated response:', responseText.substring(0, 100) + '...');
    
    return NextResponse.json({ 
      response: responseText,
      status: 'success'
    });

  } catch (error) {
    console.error("API route error:", error);
    const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred";
    return NextResponse.json(
      { 
        error: errorMessage,
        status: 'error'
      },
      { status: 500 }
    );
  }
}