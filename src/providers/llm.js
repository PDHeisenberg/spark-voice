/**
 * LLM Provider - Routes to Clawdbot Gateway
 * 
 * Instead of calling Claude directly, we send messages to the Clawdbot
 * gateway so Spark Voice shares context with the main assistant.
 */

import { readFileSync, existsSync } from 'fs';

export class LLMProvider {
  constructor(config) {
    this.config = config;
    
    // Clawdbot gateway connection
    this.gatewayUrl = config.gatewayUrl || 'http://localhost:18789';
    this.gatewayToken = config.gatewayToken || this.loadGatewayToken();
    
    if (!this.gatewayToken) {
      console.warn('⚠️  No gateway token found - will try without auth');
    }
  }

  loadGatewayToken() {
    // Load from clawdbot config
    const configPath = '/home/heisenberg/.clawdbot/clawdbot.json';
    if (existsSync(configPath)) {
      try {
        const config = JSON.parse(readFileSync(configPath, 'utf8'));
        return config.gateway?.auth?.token;
      } catch {}
    }
    return null;
  }

  /**
   * Send message to Clawdbot and get response
   * @param {Array} history - Conversation history (we only send the last user message)
   * @returns {Promise<string>} - Assistant response
   */
  async chat(history) {
    const startTime = Date.now();
    
    // Get the last user message
    const lastUserMsg = history.filter(m => m.role === 'user').pop();
    if (!lastUserMsg) {
      return "I didn't catch that. Could you repeat?";
    }

    const text = lastUserMsg.content;
    
    try {
      // Use sessions_send style API to send to main session
      const response = await fetch(`${this.gatewayUrl}/api/sessions/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.gatewayToken && { 'Authorization': `Bearer ${this.gatewayToken}` }),
        },
        body: JSON.stringify({
          sessionKey: 'agent:main:voice',  // Dedicated voice session
          message: `[Voice] ${text}`,
          timeoutSeconds: 60,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Gateway error ${response.status}: ${error}`);
      }

      const data = await response.json();
      console.log(`🧠 Clawdbot response: ${Date.now() - startTime}ms`);
      
      // Extract text from response
      if (data.reply) {
        return data.reply;
      } else if (data.content) {
        // Handle different response formats
        if (Array.isArray(data.content)) {
          return data.content.map(c => c.text || '').join('');
        }
        return data.content;
      }
      
      return data.message || data.text || "I processed that but don't have a response.";
      
    } catch (error) {
      console.error('Gateway error:', error.message);
      
      // Fallback: try direct message endpoint
      try {
        return await this.fallbackChat(text);
      } catch (fallbackError) {
        console.error('Fallback also failed:', fallbackError.message);
        return "Sorry, I'm having trouble connecting. Try again in a moment.";
      }
    }
  }

  /**
   * Fallback: Use the chat completions endpoint
   */
  async fallbackChat(text) {
    const response = await fetch(`${this.gatewayUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.gatewayToken && { 'Authorization': `Bearer ${this.gatewayToken}` }),
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        messages: [
          { role: 'system', content: 'You are Spark, responding via voice. Keep responses concise (under 100 words).' },
          { role: 'user', content: text }
        ],
        max_tokens: 300,
      }),
    });

    if (!response.ok) {
      throw new Error(`Fallback error: ${response.status}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || "No response";
  }
}
