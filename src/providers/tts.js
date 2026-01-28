/**
 * TTS Provider Abstraction
 * 
 * Supported providers:
 * - elevenlabs: High quality, ~200ms latency, paid
 * - openai: Good quality, ~150ms latency, paid
 * - deepgram: Fast, ~100ms latency, paid
 * - kokoro: Local, free, needs setup
 * 
 * Adding a new provider:
 * 1. Add method: async myProviderSynthesize(text) { ... }
 * 2. Add case in synthesize() switch
 * 3. Add to VOICES export
 */

export class TTSProvider {
  constructor(config) {
    this.provider = config.provider || 'elevenlabs';
    this.apiKey = config.apiKey;
    this.voiceId = config.voiceId;
    this.model = config.model;
    this.config = config;
    
    if (!this.apiKey && this.provider !== 'kokoro') {
      console.warn(`⚠️  No API key for TTS provider: ${this.provider}`);
    }
  }

  /**
   * Synthesize text to audio
   * @param {string} text - Text to synthesize
   * @returns {Promise<Buffer>} - Audio buffer (mp3)
   */
  async synthesize(text) {
    const startTime = Date.now();
    
    let buffer;
    switch (this.provider) {
      case 'elevenlabs':
        buffer = await this.elevenLabsSynthesize(text);
        break;
      case 'openai':
        buffer = await this.openAISynthesize(text);
        break;
      case 'deepgram':
        buffer = await this.deepgramSynthesize(text);
        break;
      case 'kokoro':
        buffer = await this.kokoroSynthesize(text);
        break;
      default:
        throw new Error(`Unknown TTS provider: ${this.provider}`);
    }
    
    console.log(`🔊 TTS (${this.provider}): ${Date.now() - startTime}ms`);
    return buffer;
  }

  async elevenLabsSynthesize(text) {
    const voiceId = this.voiceId || 'pNInz6obpgDQGcFmaJgB';
    
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: 'POST',
        headers: {
          'Accept': 'audio/mpeg',
          'Content-Type': 'application/json',
          'xi-api-key': this.apiKey,
        },
        body: JSON.stringify({
          text,
          model_id: this.model || 'eleven_turbo_v2_5',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            style: 0.2,
            use_speaker_boost: true,
          },
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`ElevenLabs error ${response.status}: ${error}`);
    }

    return Buffer.from(await response.arrayBuffer());
  }

  async openAISynthesize(text) {
    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'tts-1',
        input: text,
        voice: this.config.voice || 'nova',
        response_format: 'mp3',
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI TTS error: ${response.status}`);
    }

    return Buffer.from(await response.arrayBuffer());
  }

  async deepgramSynthesize(text) {
    const model = this.config.voice || 'aura-asteria-en';
    
    const response = await fetch(
      `https://api.deepgram.com/v1/speak?model=${model}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Token ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text }),
      }
    );

    if (!response.ok) {
      throw new Error(`Deepgram TTS error: ${response.status}`);
    }

    return Buffer.from(await response.arrayBuffer());
  }

  async kokoroSynthesize(text) {
    // Kokoro runs locally or in-browser via WebGPU
    // This is a placeholder for server-side Kokoro
    throw new Error('Kokoro TTS requires client-side implementation');
  }
}

// Voice presets for easy reference
export const VOICES = {
  elevenlabs: {
    adam: 'pNInz6obpgDQGcFmaJgB',      // Deep, conversational
    rachel: '21m00Tcm4TlvDq8ikWAM',    // Warm, natural
    domi: 'AZnzlk1XvdvUeBnXmlld',      // Strong, clear
    bella: 'EXAVITQu4vr4xnSDxMaL',     // Soft, young
    antoni: 'ErXwobaYiN019PkySvjV',    // Well-rounded
    josh: 'TxGEqnHWrfWFTfGW9XjX',      // Deep, narrative
    arnold: 'VR6AewLTigWG4xSOukaG',    // Crisp, energetic
    sam: 'yoZ06aMxZJJ28mfd3POQ',       // Raspy, dynamic
  },
  openai: {
    alloy: 'alloy',
    echo: 'echo',
    fable: 'fable',
    onyx: 'onyx',
    nova: 'nova',
    shimmer: 'shimmer',
  },
  deepgram: {
    asteria: 'aura-asteria-en',
    luna: 'aura-luna-en',
    stella: 'aura-stella-en',
    athena: 'aura-athena-en',
    hera: 'aura-hera-en',
    orion: 'aura-orion-en',
    arcas: 'aura-arcas-en',
    perseus: 'aura-perseus-en',
    angus: 'aura-angus-en',
    orpheus: 'aura-orpheus-en',
    helios: 'aura-helios-en',
    zeus: 'aura-zeus-en',
  },
};
