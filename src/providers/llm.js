/**
 * LLM Provider Abstraction
 * 
 * Supported providers:
 * - anthropic: Claude models
 * - openai: GPT models
 * - groq: Fast inference
 * - local: Ollama, etc.
 */

export class LLMProvider {
  constructor(config) {
    this.provider = config.provider || 'anthropic';
    this.model = config.model || 'claude-sonnet-4-20250514';
    this.maxTokens = config.maxTokens || 400;
    this.apiKey = config.apiKey;
    this.systemPrompt = config.systemPrompt;
    this.config = config;
    
    if (!this.apiKey) {
      throw new Error(`No API key for LLM provider: ${this.provider}`);
    }
  }

  /**
   * Chat with the LLM
   * @param {Array} history - Conversation history [{role, content}]
   * @returns {Promise<string>} - Assistant response
   */
  async chat(history) {
    const startTime = Date.now();
    
    let response;
    switch (this.provider) {
      case 'anthropic':
        response = await this.anthropicChat(history);
        break;
      case 'openai':
        response = await this.openaiChat(history);
        break;
      case 'groq':
        response = await this.groqChat(history);
        break;
      default:
        throw new Error(`Unknown LLM provider: ${this.provider}`);
    }
    
    console.log(`🧠 LLM (${this.provider}): ${Date.now() - startTime}ms`);
    return response;
  }

  async anthropicChat(history) {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: this.maxTokens,
        system: this.systemPrompt,
        messages: history.slice(-10), // Keep context manageable
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Anthropic API error ${response.status}: ${error}`);
    }

    const data = await response.json();
    return data.content[0].text;
  }

  async openaiChat(history) {
    const messages = [
      { role: 'system', content: this.systemPrompt },
      ...history.slice(-10),
    ];

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        max_tokens: this.maxTokens,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error ${response.status}: ${error}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  }

  async groqChat(history) {
    const messages = [
      { role: 'system', content: this.systemPrompt },
      ...history.slice(-10),
    ];

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model || 'mixtral-8x7b-32768',
        messages,
        max_tokens: this.maxTokens,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Groq API error ${response.status}: ${error}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  }

  /**
   * Stream chat (for future real-time text display)
   */
  async *streamChat(history) {
    // TODO: Implement streaming for each provider
    const response = await this.chat(history);
    yield response;
  }
}

// Model presets
export const MODELS = {
  anthropic: {
    opus: 'claude-opus-4-20250514',
    sonnet: 'claude-sonnet-4-20250514',
    haiku: 'claude-3-5-haiku-20241022',
  },
  openai: {
    gpt4: 'gpt-4-turbo-preview',
    gpt35: 'gpt-3.5-turbo',
  },
  groq: {
    mixtral: 'mixtral-8x7b-32768',
    llama: 'llama2-70b-4096',
  },
};
