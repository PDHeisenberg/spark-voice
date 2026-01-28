/**
 * Spark Voice Client
 * 
 * Architecture:
 * - STTProvider: Abstracts speech-to-text (browser / deepgram)
 * - AudioPlayer: Handles TTS playback with lip-sync data
 * - AvatarRenderer: Three.js 3D avatar with expressions
 * - WebSocketClient: Connection management with auto-reconnect
 * - App: Main orchestrator
 */

import * as THREE from 'three';

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  // Backend on Tailscale - only accessible to your devices
  wsUrl: 'wss://clawdbot.tail6f2982.ts.net',
  reconnectDelay: 2000,
  maxReconnectAttempts: 5,
  silenceThreshold: 1500, // ms of silence before sending
  debug: window.location.search.includes('debug'),
};

// ============================================================================
// STT PROVIDER (Browser Web Speech API)
// ============================================================================

class STTProvider {
  constructor() {
    this.recognition = null;
    this.isListening = false;
    this.onTranscript = null;
    this.onInterim = null;
    this.onError = null;
    
    this.finalTranscript = '';
    this.silenceTimer = null;
  }

  init() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
      throw new Error('Speech recognition not supported. Try Chrome or Edge.');
    }

    this.recognition = new SpeechRecognition();
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.lang = 'en-US';
    this.recognition.maxAlternatives = 1;

    this.recognition.onresult = (event) => this.handleResult(event);
    this.recognition.onerror = (event) => this.handleError(event);
    this.recognition.onend = () => this.handleEnd();
    
    return true;
  }

  handleResult(event) {
    let interimTranscript = '';

    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      const transcript = result[0].transcript;
      
      if (result.isFinal) {
        this.finalTranscript += transcript + ' ';
      } else {
        interimTranscript += transcript;
      }
    }

    // Show interim results
    if (interimTranscript && this.onInterim) {
      this.onInterim(interimTranscript);
    }

    // Reset silence timer
    if (this.silenceTimer) clearTimeout(this.silenceTimer);
    
    // Send after silence
    this.silenceTimer = setTimeout(() => {
      if (this.finalTranscript.trim()) {
        if (this.onTranscript) {
          this.onTranscript(this.finalTranscript.trim());
        }
        this.finalTranscript = '';
      }
    }, CONFIG.silenceThreshold);
  }

  handleError(event) {
    if (event.error === 'no-speech') {
      // Normal, just restart
      return;
    }
    
    if (event.error === 'not-allowed') {
      if (this.onError) this.onError('Microphone access denied');
      return;
    }
    
    console.error('STT error:', event.error);
    if (this.onError) this.onError(event.error);
  }

  handleEnd() {
    // Auto-restart if we should be listening
    if (this.isListening) {
      try {
        this.recognition.start();
      } catch (e) {
        // Already started, ignore
      }
    }
  }

  start() {
    if (!this.recognition) this.init();
    this.isListening = true;
    try {
      this.recognition.start();
    } catch (e) {
      // Already started
    }
  }

  stop() {
    this.isListening = false;
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
    }
    if (this.recognition) {
      this.recognition.stop();
    }
  }

  pause() {
    this.isListening = false;
    if (this.recognition) {
      this.recognition.stop();
    }
  }

  resume() {
    this.isListening = true;
    try {
      this.recognition.start();
    } catch (e) {}
  }
}

// ============================================================================
// AUDIO PLAYER
// ============================================================================

class AudioPlayer {
  constructor() {
    this.audioContext = null;
    this.audioQueue = [];
    this.isPlaying = false;
    this.currentSource = null;
    this.analyser = null;
    this.onStart = null;
    this.onEnd = null;
    this.onAmplitude = null;
  }

  init() {
    this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 256;
    this.analyser.connect(this.audioContext.destination);
  }

  async playChunks(chunks) {
    if (!this.audioContext) this.init();
    
    // Resume context if suspended (autoplay policy)
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }

    // Combine all chunks
    const totalLength = chunks.reduce((acc, c) => acc + c.length, 0);
    const combined = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      combined.set(chunk, offset);
      offset += chunk.length;
    }

    // Decode and play
    try {
      const audioBuffer = await this.audioContext.decodeAudioData(combined.buffer);
      await this.playBuffer(audioBuffer);
    } catch (e) {
      console.error('Audio decode error:', e);
    }
  }

  async playBuffer(audioBuffer) {
    return new Promise((resolve) => {
      this.isPlaying = true;
      if (this.onStart) this.onStart();

      this.currentSource = this.audioContext.createBufferSource();
      this.currentSource.buffer = audioBuffer;
      this.currentSource.connect(this.analyser);

      // Amplitude monitoring for lip-sync
      const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
      const monitorAmplitude = () => {
        if (!this.isPlaying) return;
        this.analyser.getByteFrequencyData(dataArray);
        const avg = dataArray.reduce((a, b) => a + b) / dataArray.length;
        if (this.onAmplitude) this.onAmplitude(avg / 255);
        requestAnimationFrame(monitorAmplitude);
      };
      monitorAmplitude();

      this.currentSource.onended = () => {
        this.isPlaying = false;
        this.currentSource = null;
        if (this.onEnd) this.onEnd();
        resolve();
      };

      this.currentSource.start(0);
    });
  }

  stop() {
    if (this.currentSource) {
      this.currentSource.stop();
      this.currentSource = null;
    }
    this.isPlaying = false;
    this.audioQueue = [];
  }

  getAmplitude() {
    if (!this.analyser || !this.isPlaying) return 0;
    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(dataArray);
    return dataArray.reduce((a, b) => a + b) / dataArray.length / 255;
  }
}

// ============================================================================
// AVATAR RENDERER (Three.js)
// ============================================================================

class AvatarRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.avatar = null;
    this.clock = new THREE.Clock();
    this.mouthAmplitude = 0;
    this.targetMouthAmplitude = 0;
    this.state = 'idle'; // idle | listening | thinking | speaking
  }

  init() {
    // Scene
    this.scene = new THREE.Scene();
    
    // Camera
    const aspect = this.canvas.clientWidth / this.canvas.clientHeight;
    this.camera = new THREE.PerspectiveCamera(30, aspect, 0.1, 100);
    this.camera.position.set(0, 1.4, 2.5);
    this.camera.lookAt(0, 1.3, 0);

    // Renderer
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: true,
    });
    this.renderer.setSize(this.canvas.clientWidth, this.canvas.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    // Lighting
    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambient);

    const key = new THREE.DirectionalLight(0xffffff, 0.8);
    key.position.set(2, 3, 2);
    this.scene.add(key);

    const fill = new THREE.DirectionalLight(0x88ccff, 0.3);
    fill.position.set(-2, 1, 2);
    this.scene.add(fill);

    const rim = new THREE.DirectionalLight(0xffd700, 0.4);
    rim.position.set(0, 2, -2);
    this.scene.add(rim);

    // Create avatar
    this.createAvatar();

    // Handle resize
    window.addEventListener('resize', () => this.onResize());

    // Start animation loop
    this.animate();
  }

  createAvatar() {
    this.avatar = new THREE.Group();

    // Materials
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x1a1a2e,
      metalness: 0.7,
      roughness: 0.3,
    });

    const accentMat = new THREE.MeshStandardMaterial({
      color: 0xffd700,
      metalness: 0.8,
      roughness: 0.2,
      emissive: 0xffd700,
      emissiveIntensity: 0.3,
    });

    const screenMat = new THREE.MeshStandardMaterial({
      color: 0x0a0a15,
      metalness: 0.5,
      roughness: 0.5,
    });

    const eyeMat = new THREE.MeshStandardMaterial({
      color: 0x00ffff,
      emissive: 0x00ffff,
      emissiveIntensity: 0.6,
    });

    // Head (rounded box-ish)
    const headGeo = new THREE.BoxGeometry(0.55, 0.65, 0.45);
    const head = new THREE.Mesh(headGeo, bodyMat);
    head.position.y = 1.5;
    this.avatar.add(head);

    // Face screen
    const faceGeo = new THREE.PlaneGeometry(0.45, 0.4);
    const face = new THREE.Mesh(faceGeo, screenMat);
    face.position.set(0, 1.52, 0.23);
    this.avatar.add(face);

    // Eyes
    const eyeGeo = new THREE.CircleGeometry(0.055, 32);
    
    this.avatar.leftEye = new THREE.Mesh(eyeGeo, eyeMat.clone());
    this.avatar.leftEye.position.set(-0.11, 1.56, 0.235);
    this.avatar.add(this.avatar.leftEye);

    this.avatar.rightEye = new THREE.Mesh(eyeGeo, eyeMat.clone());
    this.avatar.rightEye.position.set(0.11, 1.56, 0.235);
    this.avatar.add(this.avatar.rightEye);

    // Mouth (animated bar)
    const mouthGeo = new THREE.PlaneGeometry(0.18, 0.04);
    const mouthMat = new THREE.MeshStandardMaterial({
      color: 0x00ffff,
      emissive: 0x00ffff,
      emissiveIntensity: 0.4,
    });
    this.avatar.mouth = new THREE.Mesh(mouthGeo, mouthMat);
    this.avatar.mouth.position.set(0, 1.42, 0.235);
    this.avatar.add(this.avatar.mouth);

    // Antenna
    const antennaGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.18);
    const antenna = new THREE.Mesh(antennaGeo, accentMat);
    antenna.position.set(0, 1.92, 0);
    this.avatar.add(antenna);

    const ballGeo = new THREE.SphereGeometry(0.035);
    this.avatar.antennaBall = new THREE.Mesh(ballGeo, accentMat.clone());
    this.avatar.antennaBall.position.set(0, 2.03, 0);
    this.avatar.add(this.avatar.antennaBall);

    // Neck
    const neckGeo = new THREE.CylinderGeometry(0.08, 0.1, 0.12);
    const neck = new THREE.Mesh(neckGeo, bodyMat);
    neck.position.y = 1.12;
    this.avatar.add(neck);

    // Body
    const bodyGeo = new THREE.BoxGeometry(0.6, 0.55, 0.35);
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.8;
    this.avatar.add(body);

    // Chest emblem (⚡)
    const emblemGeo = new THREE.CircleGeometry(0.07, 6);
    this.avatar.emblem = new THREE.Mesh(emblemGeo, accentMat.clone());
    this.avatar.emblem.position.set(0, 0.85, 0.18);
    this.avatar.add(this.avatar.emblem);

    // Shoulders
    const shoulderGeo = new THREE.SphereGeometry(0.08);
    const leftShoulder = new THREE.Mesh(shoulderGeo, bodyMat);
    leftShoulder.position.set(-0.35, 0.95, 0);
    this.avatar.add(leftShoulder);

    const rightShoulder = new THREE.Mesh(shoulderGeo, bodyMat);
    rightShoulder.position.set(0.35, 0.95, 0);
    this.avatar.add(rightShoulder);

    this.scene.add(this.avatar);
  }

  animate() {
    requestAnimationFrame(() => this.animate());

    const delta = this.clock.getDelta();
    const time = this.clock.getElapsedTime();

    if (this.avatar) {
      // Smooth mouth amplitude
      this.mouthAmplitude += (this.targetMouthAmplitude - this.mouthAmplitude) * 0.3;

      // Idle bob
      const bobAmount = this.state === 'thinking' ? 0.03 : 0.015;
      const bobSpeed = this.state === 'thinking' ? 3 : 1.5;
      this.avatar.position.y = Math.sin(time * bobSpeed) * bobAmount;
      this.avatar.rotation.y = Math.sin(time * 0.5) * 0.04;

      // Antenna glow
      if (this.avatar.antennaBall) {
        let intensity = 0.3;
        if (this.state === 'listening') intensity = 0.5 + Math.sin(time * 4) * 0.3;
        if (this.state === 'thinking') intensity = 0.4 + Math.sin(time * 8) * 0.4;
        if (this.state === 'speaking') intensity = 0.6 + this.mouthAmplitude * 0.4;
        this.avatar.antennaBall.material.emissiveIntensity = intensity;
      }

      // Eye glow based on state
      const eyeIntensity = this.state === 'speaking' ? 0.8 : 
                           this.state === 'listening' ? 0.7 : 0.5;
      this.avatar.leftEye.material.emissiveIntensity = eyeIntensity;
      this.avatar.rightEye.material.emissiveIntensity = eyeIntensity;

      // Mouth animation (lip-sync)
      if (this.avatar.mouth) {
        if (this.state === 'speaking') {
          // Animate mouth based on audio amplitude
          const scale = 1 + this.mouthAmplitude * 2;
          this.avatar.mouth.scale.y = scale;
          this.avatar.mouth.material.emissiveIntensity = 0.4 + this.mouthAmplitude * 0.6;
        } else {
          this.avatar.mouth.scale.y = 1;
          this.avatar.mouth.material.emissiveIntensity = 0.3;
        }
      }

      // Random blink
      if (Math.random() < 0.003) {
        this.blink();
      }

      // Emblem pulse
      if (this.avatar.emblem) {
        const pulse = this.state === 'thinking' ? 
          0.4 + Math.sin(time * 6) * 0.3 : 
          0.3 + Math.sin(time * 2) * 0.1;
        this.avatar.emblem.material.emissiveIntensity = pulse;
      }
    }

    this.renderer.render(this.scene, this.camera);
  }

  blink() {
    if (!this.avatar.leftEye || !this.avatar.rightEye) return;
    
    this.avatar.leftEye.scale.y = 0.1;
    this.avatar.rightEye.scale.y = 0.1;
    
    setTimeout(() => {
      if (this.avatar.leftEye) this.avatar.leftEye.scale.y = 1;
      if (this.avatar.rightEye) this.avatar.rightEye.scale.y = 1;
    }, 100);
  }

  setState(state) {
    this.state = state;
  }

  setMouthAmplitude(amplitude) {
    this.targetMouthAmplitude = amplitude;
  }

  onResize() {
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }
}

// ============================================================================
// WEBSOCKET CLIENT
// ============================================================================

class WebSocketClient {
  constructor(url) {
    this.url = url;
    this.ws = null;
    this.reconnectAttempts = 0;
    this.onMessage = null;
    this.onConnect = null;
    this.onDisconnect = null;
    this.onError = null;
  }

  connect() {
    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      console.log('⚡ Connected to Spark server');
      this.reconnectAttempts = 0;
      if (this.onConnect) this.onConnect();
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (this.onMessage) this.onMessage(data);
      } catch (e) {
        console.error('Invalid message:', e);
      }
    };

    this.ws.onclose = () => {
      console.log('Disconnected from Spark server');
      if (this.onDisconnect) this.onDisconnect();
      this.attemptReconnect();
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      if (this.onError) this.onError(error);
    };
  }

  attemptReconnect() {
    if (this.reconnectAttempts >= CONFIG.maxReconnectAttempts) {
      console.error('Max reconnect attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = CONFIG.reconnectDelay * this.reconnectAttempts;
    
    console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    setTimeout(() => this.connect(), delay);
  }

  send(type, data = {}) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, ...data }));
    }
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

// ============================================================================
// WAVEFORM VISUALIZER
// ============================================================================

class WaveformVisualizer {
  constructor(container) {
    this.container = container;
    this.bars = [];
    this.init();
  }

  init() {
    // Create wave bars
    for (let i = 0; i < 12; i++) {
      const bar = document.createElement('div');
      bar.className = 'wave-bar';
      bar.style.animationDelay = `${i * 0.05}s`;
      this.container.appendChild(bar);
      this.bars.push(bar);
    }
  }

  show() {
    this.container.classList.add('active');
  }

  hide() {
    this.container.classList.remove('active');
  }

  setAmplitude(amplitude) {
    // Vary bar heights based on amplitude
    this.bars.forEach((bar, i) => {
      const offset = Math.sin(Date.now() / 100 + i * 0.5);
      const height = 8 + amplitude * 24 + offset * 4;
      bar.style.height = `${Math.max(4, height)}px`;
    });
  }
}

// ============================================================================
// MAIN APP
// ============================================================================

class SparkVoiceApp {
  constructor() {
    this.stt = new STTProvider();
    this.audio = new AudioPlayer();
    this.avatar = null;
    this.ws = null;
    this.waveform = null;

    this.state = 'idle'; // idle | listening | thinking | speaking
    this.audioChunks = [];
    this.startTime = null;

    // DOM elements
    this.els = {
      loading: document.getElementById('loading'),
      statusIndicator: document.getElementById('status-indicator'),
      statusText: document.getElementById('status-text'),
      latency: document.getElementById('latency'),
      transcript: document.getElementById('transcript'),
      startBtn: document.getElementById('start-btn'),
      muteBtn: document.getElementById('mute-btn'),
      clearBtn: document.getElementById('clear-btn'),
      waveform: document.getElementById('waveform'),
      debug: document.getElementById('debug'),
    };

    this.isMuted = false;
  }

  async init() {
    // Initialize avatar
    const canvas = document.getElementById('avatar-canvas');
    this.avatar = new AvatarRenderer(canvas);
    this.avatar.init();

    // Initialize waveform
    this.waveform = new WaveformVisualizer(this.els.waveform);

    // Set up audio callbacks
    this.audio.onStart = () => {
      this.setState('speaking');
      this.waveform.show();
    };

    this.audio.onEnd = () => {
      this.waveform.hide();
      this.setState('listening');
      this.stt.resume();
    };

    this.audio.onAmplitude = (amp) => {
      this.avatar.setMouthAmplitude(amp);
      this.waveform.setAmplitude(amp);
    };

    // Set up STT callbacks
    this.stt.onTranscript = (text) => {
      if (!this.isMuted && this.state === 'listening') {
        this.sendTranscript(text);
      }
    };

    this.stt.onInterim = (text) => {
      this.updateStatus('listening', `Hearing: "${text.slice(0, 40)}..."`);
    };

    this.stt.onError = (error) => {
      this.updateStatus('error', error);
    };

    // Event listeners
    this.els.startBtn.addEventListener('click', () => this.start());
    this.els.muteBtn.addEventListener('click', () => this.toggleMute());
    this.els.clearBtn.addEventListener('click', () => this.clearTranscript());

    // Hide loading
    this.els.loading.classList.add('hidden');

    this.log('Initialized');
  }

  start() {
    // Initialize STT
    try {
      this.stt.init();
    } catch (e) {
      this.updateStatus('error', e.message);
      return;
    }

    // Connect WebSocket
    this.ws = new WebSocketClient(CONFIG.wsUrl);
    
    this.ws.onConnect = () => {
      this.updateStatus('listening', 'Listening...');
      this.stt.start();
      this.setState('listening');
    };

    this.ws.onDisconnect = () => {
      this.updateStatus('error', 'Disconnected, reconnecting...');
      this.stt.pause();
    };

    this.ws.onMessage = (data) => this.handleServerMessage(data);
    
    this.ws.connect();

    // Update UI
    this.els.startBtn.classList.add('hidden');
    this.els.muteBtn.classList.remove('hidden');
    this.els.clearBtn.classList.remove('hidden');
  }

  handleServerMessage(data) {
    this.log(`Server: ${data.type}`);

    switch (data.type) {
      case 'ready':
        console.log('Session:', data.sessionId);
        break;

      case 'ack':
        // Server acknowledged our transcript
        break;

      case 'thinking':
        this.setState('thinking');
        this.updateStatus('thinking', 'Thinking...');
        this.startTime = Date.now();
        break;

      case 'text':
        this.addMessage(data.content, 'assistant');
        const latency = this.startTime ? Date.now() - this.startTime : 0;
        this.els.latency.textContent = latency ? `${latency}ms` : '';
        break;

      case 'audio_start':
        this.audioChunks = [];
        break;

      case 'audio_chunk':
        const bytes = Uint8Array.from(atob(data.data), c => c.charCodeAt(0));
        this.audioChunks.push(bytes);
        break;

      case 'audio_end':
        if (this.audioChunks.length > 0) {
          this.audio.playChunks(this.audioChunks);
        } else {
          // No audio, just go back to listening
          this.setState('listening');
        }
        break;

      case 'tts_error':
        console.warn('TTS failed:', data.message);
        this.setState('listening');
        break;

      case 'error':
        this.updateStatus('error', data.message);
        setTimeout(() => {
          if (this.state !== 'speaking') {
            this.setState('listening');
            this.updateStatus('listening', 'Listening...');
          }
        }, 3000);
        break;
    }
  }

  sendTranscript(text) {
    this.addMessage(text, 'user');
    this.updateStatus('thinking', 'Processing...');
    this.stt.pause();
    this.ws.send('transcript', { text, isFinal: true });
  }

  setState(state) {
    this.state = state;
    this.avatar.setState(state);
    this.els.statusIndicator.className = state;
  }

  updateStatus(state, text) {
    this.els.statusIndicator.className = state;
    this.els.statusText.textContent = text;
  }

  addMessage(text, role) {
    const div = document.createElement('div');
    div.className = `message ${role}`;
    div.textContent = role === 'user' ? text : `⚡ ${text}`;
    this.els.transcript.appendChild(div);
    this.els.transcript.parentElement.scrollTop = this.els.transcript.parentElement.scrollHeight;
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    
    if (this.isMuted) {
      this.stt.pause();
      this.els.muteBtn.textContent = '🔇 Unmute';
      this.els.muteBtn.classList.add('active');
      this.updateStatus('', 'Muted');
    } else {
      this.stt.resume();
      this.els.muteBtn.textContent = '🎤 Mute';
      this.els.muteBtn.classList.remove('active');
      this.updateStatus('listening', 'Listening...');
    }
  }

  clearTranscript() {
    this.els.transcript.innerHTML = '';
  }

  log(msg) {
    if (CONFIG.debug) {
      this.els.debug.textContent = msg;
      console.log(`[Spark] ${msg}`);
    }
  }
}

// ============================================================================
// INITIALIZE
// ============================================================================

const app = new SparkVoiceApp();
app.init();
