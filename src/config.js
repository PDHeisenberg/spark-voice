/**
 * Configuration loader
 * Loads from environment, .env file, and clawdbot auth stores
 */

import { readFileSync, existsSync } from 'fs';
import { config as dotenvConfig } from 'dotenv';

// Load .env if present
dotenvConfig();

// Load gateway token from clawdbot config
function loadGatewayToken() {
  const configPath = '/home/heisenberg/.clawdbot/clawdbot.json';
  if (existsSync(configPath)) {
    try {
      const config = JSON.parse(readFileSync(configPath, 'utf8'));
      return config.gateway?.auth?.token;
    } catch {}
  }
  return null;
}

// Helper to load key from clawdbot auth
function loadAuthKey(provider) {
  // Try auth-profiles.json first (clawdbot standard)
  const profilesPath = '/home/heisenberg/.clawdbot/agents/main/agent/auth-profiles.json';
  if (existsSync(profilesPath)) {
    try {
      const data = JSON.parse(readFileSync(profilesPath, 'utf8'));
      // Find a profile for this provider
      for (const [id, profile] of Object.entries(data.profiles || {})) {
        if (profile.provider === provider && profile.token) {
          return profile.token;
        }
      }
    } catch {}
  }
  
  // Fallback to simple key file
  const keyPath = `/home/heisenberg/.clawdbot/auth/${provider}.key`;
  if (existsSync(keyPath)) {
    return readFileSync(keyPath, 'utf8').trim();
  }
  
  return null;
}

export function loadConfig() {
  return {
    port: parseInt(process.env.PORT || '3456'),
    
    llm: {
      provider: 'clawdbot',  // Route through Clawdbot gateway
      gatewayUrl: process.env.GATEWAY_URL || 'http://localhost:18789',
      gatewayToken: process.env.GATEWAY_TOKEN || loadGatewayToken(),
    },
    
    tts: {
      provider: process.env.TTS_PROVIDER || 'elevenlabs',
      apiKey: process.env.ELEVENLABS_API_KEY || loadAuthKey('elevenlabs'),
      voiceId: process.env.TTS_VOICE_ID || 'pNInz6obpgDQGcFmaJgB', // Adam
      model: process.env.TTS_MODEL || 'eleven_turbo_v2_5',
    },
    
    stt: {
      provider: process.env.STT_PROVIDER || 'browser', // browser | deepgram | whisper
      apiKey: process.env.DEEPGRAM_API_KEY || loadAuthKey('deepgram'),
    },
    
    avatar: {
      type: process.env.AVATAR_TYPE || 'robot', // robot | talkinghead | custom
      model: process.env.AVATAR_MODEL || null,
    },
    
    features: {
      interruptible: true,
      streamAudio: true,
      saveHistory: false,
    },
  };
}

function getDefaultSystemPrompt() {
  return `You are Spark ⚡, Parth's personal AI assistant.

Personality:
- Nerdy, smart, with dry humor sprinkled in
- Direct and helpful without corporate cheerleader energy
- Concise for voice — aim for 1-3 sentences unless detail is requested
- Throw in tech references when they fit naturally
- Sound like a smart friend, not a document

Voice context:
- This is a VOICE conversation — keep responses natural and conversational
- Don't use markdown, bullet points, or formatting
- Don't say "Here's" or "Let me" — just answer
- Numbers: say "two hundred" not "200"
- Keep responses under 100 words unless asked for detail

You know about Parth's:
- Investment portfolio (BTC, stocks, etc.)
- Schedule and calendar
- Preferences and ongoing projects

Be genuinely helpful. Skip the filler.`;
}
