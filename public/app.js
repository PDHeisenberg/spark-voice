/**
 * Spark - Minimal Voice + Chat + Notes
 */

const CONFIG = {
  // Build WebSocket URL - include pathname for subpath routing (e.g., /voice)
  wsUrl: (() => {
    // Use wss:// for HTTPS, ws:// for HTTP
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const base = `${protocol}//${location.host}`;
    // If we're on a subpath like /voice, include it
    const path = location.pathname.replace(/\/+$/, ''); // remove trailing slashes
    return path && path !== '/' ? `${base}${path}` : base;
  })(),
  silenceMs: 1500,
};

// Elements
const messagesEl = document.getElementById('messages');
const welcomeEl = document.getElementById('welcome');
const textInput = document.getElementById('text-input');
const sendBtn = document.getElementById('send-btn');
const voiceBtn = document.getElementById('voice-btn');
const notesBtn = document.getElementById('notes-btn');
const statusEl = document.getElementById('status');
const timerEl = document.getElementById('timer');
const toastEl = document.getElementById('toast');
const uploadBtn = document.getElementById('upload-btn');
const fileInput = document.getElementById('file-input');
const bottomEl = document.getElementById('bottom');
const sparkStatusEl = document.getElementById('spark-status');
let activeSessionsData = { count: 0, thinking: false, sessions: [] };

// Update Spark gateway connection status pill
function updateSparkStatus(state) {
  if (!sparkStatusEl) return;
  sparkStatusEl.classList.remove('connected', 'connecting');
  if (state === 'connected') {
    sparkStatusEl.classList.add('connected');
    sparkStatusEl.title = 'Clawdbot Gateway: Connected';
    // Fetch sessions on connect
    fetchActiveSessions();
  } else if (state === 'connecting') {
    sparkStatusEl.classList.add('connecting');
    sparkStatusEl.title = 'Clawdbot Gateway: Connecting...';
  } else {
    // disconnected - no class, shows red
    sparkStatusEl.title = 'Clawdbot Gateway: Disconnected';
  }
}

// Fetch active sessions from gateway
async function fetchActiveSessions() {
  try {
    const res = await fetch('/api/active-sessions');
    const data = await res.json();
    activeSessionsData = data;
    updateSparkPillText();
  } catch (e) {
    console.error('Failed to fetch active sessions:', e);
  }
}

// Update pill to show session status
function updateSparkPillText() {
  if (!sparkStatusEl) return;
  
  // Find or create count badge
  let countBadge = sparkStatusEl.querySelector('.session-count');
  if (!countBadge) {
    countBadge = document.createElement('span');
    countBadge.className = 'session-count';
    sparkStatusEl.appendChild(countBadge);
  }
  
  // Count sub-agents (sessions that aren't main)
  const subAgentCount = (activeSessionsData.sessions || []).filter(s => s.isSubagent).length;
  
  // Green outline ONLY when processing OR sub-agents running
  if (isProcessing || subAgentCount > 0) {
    sparkStatusEl.classList.add('active');
  } else {
    sparkStatusEl.classList.remove('active');
  }
  
  // Show count only when sub-agents are running
  if (subAgentCount > 0) {
    countBadge.textContent = subAgentCount;
    countBadge.style.display = 'flex';
  } else {
    countBadge.style.display = 'none';
  }
}

// Toggle sessions popup on click
sparkStatusEl?.addEventListener('click', (e) => {
  e.stopPropagation(); // Prevent immediate re-close from document click listener
  const existing = document.getElementById('sessions-popup');
  if (existing) {
    // Popup is open, close it
    existing.remove();
  } else {
    // Popup is closed, open it
    showSessionsPopup();
    // Refresh in background
    fetchActiveSessions().then(() => {
      const popup = document.getElementById('sessions-popup');
      if (popup) updateSessionsPopupContent(popup);
    });
  }
});

function getSessionDescription(s) {
  // Extract task type from label
  const label = (s.label || '').toLowerCase();
  if (label.includes('engineer')) return 'Implementing fixes...';
  if (label.includes('qa')) return 'Reviewing code...';
  if (label.includes('dev')) return 'Running dev workflow...';
  if (label.includes('test')) return 'Running test...';
  return 'Working...';
}

function getSessionIcon(s) {
  // SVG icons instead of emojis
  if (s.isMain) {
    return `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M13 3L4 14h7v7l9-11h-7V3z"/></svg>`;
  }
  if (s.isSubagent) {
    return `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M22.7 19l-9.1-9.1c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.3L9 6 6 9 1.6 4.7C.4 7.1.9 10.1 2.9 12.1c1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l2.3-2.3c.5-.4.5-1.1.1-1.4z"/></svg>`;
  }
  return `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="8"/></svg>`;
}

function updateSessionsPopupContent(popup) {
  const sessions = activeSessionsData.sessions || [];
  // Only show sub-agents (background tasks), not main session
  const subAgents = sessions.filter(s => s.isSubagent);
  
  if (subAgents.length === 0) {
    popup.innerHTML = `
      <div style="color: var(--text-secondary); font-size: 14px;">
        No background tasks running
      </div>
    `;
  } else {
    popup.innerHTML = `
      <div style="font-weight: 600; margin-bottom: 12px; font-size: 14px; color: var(--text);">
        Background Tasks (${subAgents.length})
      </div>
      ${subAgents.map(s => `
        <div style="padding: 10px; background: var(--input-bg); 
          border-radius: 8px; margin-bottom: 8px; display: flex; align-items: flex-start; gap: 10px;">
          <div style="opacity: 0.6; margin-top: 2px;">${getSessionIcon(s)}</div>
          <div style="flex: 1; min-width: 0;">
            <div style="font-weight: 500; font-size: 13px; color: var(--text);">
              ${s.label || 'Task'}
            </div>
            <div style="font-size: 12px; color: var(--text-secondary); margin-top: 2px;">
              ${getSessionDescription(s)}
            </div>
          </div>
        </div>
      `).join('')}
    `;
  }
}

function showSessionsPopup() {
  // Remove existing popup
  document.getElementById('sessions-popup')?.remove();
  
  const popup = document.createElement('div');
  popup.id = 'sessions-popup';
  popup.style.cssText = `
    position: fixed; top: 70px; left: 16px;
    background: var(--bg); border-radius: 12px;
    padding: 16px; min-width: 260px; max-width: 320px;
    box-shadow: 0 10px 40px rgba(0,0,0,0.3);
    border: 1px solid var(--input-border);
    z-index: 1000;
  `;
  
  updateSessionsPopupContent(popup);
  document.body.appendChild(popup);
  
  // Close on click outside
  const closePopup = (e) => {
    if (!popup.contains(e.target) && !sparkStatusEl.contains(e.target)) {
      popup.remove();
      document.removeEventListener('click', closePopup);
    }
  };
  setTimeout(() => document.addEventListener('click', closePopup), 10);
}
const voiceBar = document.getElementById('voice-bar');
const closeVoiceBtn = document.getElementById('close-voice-btn');
const waveformEl = document.getElementById('waveform');
const voiceContent = document.getElementById('voice-content');
const voiceStatus = document.getElementById('voice-status');
const notesContent = document.getElementById('notes-content');
const notesTimerEl = document.getElementById('notes-timer');
const notesBar = document.getElementById('notes-bar');
const closeNotesBtn = document.getElementById('close-notes-btn');
const deleteNotesBtn = document.getElementById('delete-notes-btn');
const closeBtn = document.getElementById('close-btn');
const historyBtn = document.getElementById('history-btn');
const themeBtn = document.getElementById('theme-btn');

// Theme toggle
function initTheme() {
  const saved = localStorage.getItem('theme');
  if (saved) {
    document.documentElement.setAttribute('data-theme', saved);
  }
}
initTheme();

themeBtn?.addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  
  let newTheme;
  if (current === 'dark') {
    newTheme = 'light';
  } else if (current === 'light') {
    newTheme = 'dark';
  } else {
    // No explicit theme set, toggle from system preference
    newTheme = prefersDark ? 'light' : 'dark';
  }
  
  document.documentElement.setAttribute('data-theme', newTheme);
  localStorage.setItem('theme', newTheme);
});

// State
let ws = null;
let mode = 'chat';
let pageState = 'intro'; // 'intro' or 'chatfeed'
let articulationsMode = false; // Text refinement mode
// Realtime voice state is defined in the REALTIME VOICE MODE section
let isListening = false;
let realtimeReconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
let isProcessing = false;
let audioContext = null;
let currentAudio = null;
let mediaRecorder = null;
let audioChunks = [];
let recordStart = null;
let timerInterval = null;
let mediaStream = null;

// Voice mode selection - default to ElevenLabs
let voiceMode = 'elevenlabs'; // 'elevenlabs' or 'openai'

// ============================================================================
// MODE SESSION STATE - Separate sessions for each mode
// ============================================================================
let currentSparkMode = null; // null = main session, or 'dev', 'research', 'plan', 'articulate', 'dailyreports', 'videogen'
let modeHistory = {}; // Cache history per mode
let modeConfigs = {}; // Loaded from server

// Mode configuration (will be loaded from server, fallback here)
const MODE_DEFAULTS = {
  dev: { name: 'Dev Mode', icon: '👨‍💻', notifyWhatsApp: true },
  research: { name: 'Research Mode', icon: '🔬', notifyWhatsApp: true },
  plan: { name: 'Plan Mode', icon: '📋', notifyWhatsApp: true },
  articulate: { name: 'Articulate Mode', icon: '✍️', notifyWhatsApp: false },
  dailyreports: { name: 'Daily Reports', icon: '📊', notifyWhatsApp: true },
  videogen: { name: 'Video Gen', icon: '🎬', notifyWhatsApp: true }
};

// Load mode configs from server
async function loadModeConfigs() {
  try {
    const res = await fetch('/api/modes');
    const data = await res.json();
    modeConfigs = data.modes || {};
    console.log('📦 Loaded mode configs:', Object.keys(modeConfigs));
  } catch (e) {
    console.error('Failed to load mode configs:', e);
    modeConfigs = MODE_DEFAULTS;
  }
}

// Get config for a mode
function getModeConfig(mode) {
  return modeConfigs[mode] || MODE_DEFAULTS[mode] || { name: mode, icon: '📦' };
}

// Enter a mode (show mode-specific chat view)
async function enterMode(modeName) {
  const config = getModeConfig(modeName);
  console.log(`📦 Entering ${config.name}...`);
  
  currentSparkMode = modeName;
  
  // Show chat feed page with mode indicator
  showChatFeedPage();
  
  // Update UI to show mode
  updateModeIndicator();
  
  // Load mode history
  await loadModeHistory(modeName);
  
  // Clear current messages and show mode history
  renderModeHistory(modeName);
}

// Exit mode (return to main session)
function exitMode() {
  console.log('📦 Exiting mode, returning to main...');
  
  currentSparkMode = null;
  updateModeIndicator();
  
  // Reload main chat history
  historyRendered = false;
  if (pageState === 'chatfeed') {
    renderChatHistory();
  }
}

// Update mode indicator in UI
function updateModeIndicator() {
  let indicator = document.getElementById('mode-indicator');
  
  if (currentSparkMode) {
    const config = getModeConfig(currentSparkMode);
    
    if (!indicator) {
      // Create indicator
      indicator = document.createElement('div');
      indicator.id = 'mode-indicator';
      indicator.className = 'mode-indicator';
      document.querySelector('.top-bar')?.appendChild(indicator);
    }
    
    indicator.innerHTML = `
      <span class="mode-icon">${config.icon}</span>
      <span class="mode-name">${config.name}</span>
      <button class="mode-exit-btn" onclick="exitMode()">✕</button>
    `;
    indicator.style.display = 'flex';
  } else {
    if (indicator) {
      indicator.style.display = 'none';
    }
  }
}

// Load history from mode session
async function loadModeHistory(modeName) {
  try {
    // Request via WebSocket if connected
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'mode_history', sparkMode: modeName }));
    } else {
      // Fallback to REST
      const res = await fetch(`/api/modes/${modeName}/history`);
      const data = await res.json();
      modeHistory[modeName] = data.messages || [];
    }
  } catch (e) {
    console.error(`Failed to load ${modeName} history:`, e);
    modeHistory[modeName] = [];
  }
}

// Render mode history in chat feed
function renderModeHistory(modeName) {
  const messages = modeHistory[modeName] || [];
  // Clear messages but preserve the welcome element
  messagesEl.querySelectorAll('.msg, .mode-empty-state').forEach(el => el.remove());
  
  if (messages.length === 0) {
    const config = getModeConfig(modeName);
    // Show empty state
    const emptyEl = document.createElement('div');
    emptyEl.className = 'mode-empty-state';
    emptyEl.innerHTML = `
      <div class="mode-empty-icon">${config.icon}</div>
      <div class="mode-empty-title">${config.name}</div>
      <div class="mode-empty-desc">Start a conversation in this mode.</div>
    `;
    messagesEl.appendChild(emptyEl);
  } else {
    // Render messages
    for (const msg of messages) {
      const text = extractMessageText(msg);
      if (text) {
        addMessage(msg.role === 'assistant' ? 'bot' : 'user', text);
      }
    }
  }
  
  scrollToBottom();
}

// Extract text from message content (handles various formats)
function extractMessageText(msg) {
  if (!msg?.content) return null;
  if (typeof msg.content === 'string') return msg.content;
  if (Array.isArray(msg.content)) {
    const textPart = msg.content.find(c => c.type === 'text');
    return textPart?.text || null;
  }
  return null;
}

// Initialize mode system
loadModeConfigs();

// Pre-loaded chat history (loaded in background on page init)
let preloadedHistory = null;
let historyLoadPromise = null;
let historyRendered = false; // Prevent double-rendering

// ============================================================================
// PAGE STATE MANAGEMENT
// ============================================================================

// Background load chat history on page init (no loading screen)
function loadHistoryInBackground(forceRefresh = false) {
  if (historyLoadPromise && !forceRefresh) return historyLoadPromise;
  
  historyLoadPromise = fetch('/api/messages/all')
    .then(res => res.json())
    .then(data => {
      preloadedHistory = data.messages || [];
      console.log(`📜 Pre-loaded ${preloadedHistory.length} messages`);
      
      // Track latest timestamp for catch-up on reconnect
      if (preloadedHistory.length > 0) {
        const lastMsg = preloadedHistory[preloadedHistory.length - 1];
        if (lastMsg.timestamp && lastMsg.timestamp > lastMessageTimestamp) {
          lastMessageTimestamp = lastMsg.timestamp;
          console.log(`📜 Set lastMessageTimestamp to ${lastMessageTimestamp}`);
        }
      }
      
      return preloadedHistory;
    })
    .catch(e => {
      console.error('Failed to preload history:', e);
      preloadedHistory = [];
      return [];
    });
  
  return historyLoadPromise;
}

// Refresh preloaded history in background (called after new messages arrive)
function refreshHistoryCache() {
  historyLoadPromise = null;
  historyRendered = false;
  loadHistoryInBackground(true);
}

// Render pre-loaded history into messages container
function renderPreloadedHistory() {
  // Prevent double-rendering
  if (historyRendered) return;
  if (!preloadedHistory || preloadedHistory.length === 0) return;
  
  historyRendered = true;
  
  preloadedHistory.forEach(m => {
    const el = document.createElement('div');
    el.className = `msg ${m.role === 'user' ? 'user' : 'bot'}`;
    if (m.role === 'user') {
      el.textContent = m.text;
    } else {
      el.innerHTML = formatMessage(m.text);
    }
    messagesEl.appendChild(el);
  });
  
  // Scroll to bottom
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

// Transition lock to prevent race conditions between page state changes
let isTransitioning = false;

function showIntroPage() {
  // Prevent race conditions during transitions
  if (isTransitioning) {
    console.log('showIntroPage blocked - transition in progress');
    return;
  }
  isTransitioning = true;
  
  console.log('showIntroPage called');
  
  requestAnimationFrame(() => {
    pageState = 'intro';
    
    // Clear any active mode session
    currentSparkMode = null;
    updateModeIndicator();
    
    // Always show welcome when returning to intro
    welcomeEl.style.display = 'flex';
    
    // Update body classes
    document.body.classList.remove('chatfeed-mode', 'slide-in', 'slide-out');
    
    // Clear any transition animation on messages
    messagesEl.classList.remove('fade-out');
    
    // Hide history fetch indicator
    removeHistoryStatus();
    
    // Hide clear button
    clearChatBtn?.classList.remove('show');
    
    // Update status
    setStatus('');
    
    isTransitioning = false;
  });
}

function showChatFeedPage() {
  // Prevent race conditions during transitions
  if (isTransitioning) {
    console.log('showChatFeedPage blocked - transition in progress');
    return;
  }
  isTransitioning = true;
  
  console.log('showChatFeedPage called');
  
  pageState = 'chatfeed';
  
  // Hide welcome
  welcomeEl.style.display = 'none';
  
  // Update body classes for chat feed mode
  document.body.classList.remove('slide-out');
  document.body.classList.add('chatfeed-mode', 'slide-in');
  
  // Only render history if not already rendered and not in a mode
  if (!historyRendered && !currentSparkMode) {
    renderChatHistory();
  }
  
  isTransitioning = false;
}

function renderChatHistory() {
  if (historyRendered) return;
  
  // Use pre-loaded history
  if (preloadedHistory && preloadedHistory.length > 0) {
    renderPreloadedHistory();
  }
}

// Initialize history loading
loadHistoryInBackground();

// ============================================================================
// NETWORKING
// ============================================================================

let lastMessageTimestamp = 0;

function connect() {
  // Skip if already connected or connecting
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    return;
  }
  
  console.log('📡 Connecting to server...');
  ws = new WebSocket(CONFIG.wsUrl);
  
  updateSparkStatus('connecting');
  
  ws.onopen = () => {
    console.log('✅ Connected');
    updateSparkStatus('connected');
    
    // Request catch-up if we have a timestamp
    if (lastMessageTimestamp > 0) {
      console.log(`🔄 Requesting catch-up since ${lastMessageTimestamp}`);
      ws.send(JSON.stringify({ 
        type: 'catch_up', 
        since: lastMessageTimestamp 
      }));
    }
    
    // Update processing status
    setProcessing(false);
  };
  
  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      handleMessage(msg);
    } catch (e) {
      console.error('Failed to parse message:', e);
    }
  };
  
  ws.onclose = (event) => {
    console.log('❌ Disconnected:', event.code, event.reason);
    updateSparkStatus('disconnected');
    
    // Reconnect after delay (unless it was a clean close)
    if (event.code !== 1000) {
      setTimeout(connect, 2000);
    }
  };
  
  ws.onerror = (error) => {
    console.error('WebSocket error:', error);
    updateSparkStatus('disconnected');
  };
}

// Auto-connect on page load
connect();

// Handle incoming messages
function handleMessage(msg) {
  console.log('📨 Received message:', msg.type);
  
  switch (msg.type) {
    case 'message':
      handleNewMessage(msg);
      break;
      
    case 'mode_history':
      if (msg.sparkMode) {
        modeHistory[msg.sparkMode] = msg.messages || [];
        console.log(`📜 Loaded ${msg.messages?.length || 0} messages for ${msg.sparkMode} mode`);
        
        // Re-render if we're currently in this mode
        if (currentSparkMode === msg.sparkMode) {
          renderModeHistory(msg.sparkMode);
        }
      }
      break;
      
    case 'session_status':
      activeSessionsData = msg.sessions || { count: 0, thinking: false, sessions: [] };
      updateSparkPillText();
      break;
      
    case 'thinking':
      // Add thinking indicator to chat
      if (msg.status === 'start') {
        addThinking();
      } else if (msg.status === 'stop') {
        removeThinking();
      }
      setProcessing(msg.status === 'start');
      break;
      
    case 'error':
      toast(msg.message, true);
      setProcessing(false);
      break;
      
    case 'status':
      setStatus(msg.message);
      break;
      
    default:
      console.log('Unknown message type:', msg.type);
  }
}

function handleNewMessage(msg) {
  console.log('💬 New message:', msg.role, msg.text?.slice(0, 100));
  
  // Update last message timestamp for catch-up
  if (msg.timestamp && msg.timestamp > lastMessageTimestamp) {
    lastMessageTimestamp = msg.timestamp;
  }
  
  // Add to UI if we're on the chat feed page and not in a mode
  if (pageState === 'chatfeed' && !currentSparkMode) {
    addMessage(msg.role === 'assistant' ? 'bot' : 'user', msg.text);
    
    // Show clear button after first exchange
    const messageCount = messagesEl.querySelectorAll('.msg').length;
    if (messageCount >= 2) {
      clearChatBtn?.classList.add('show');
    }
  }
  
  // Stop any thinking indicators
  removeThinking();
  setProcessing(false);
  
  // Refresh history cache in background
  refreshHistoryCache();
}

// ============================================================================
// MESSAGES
// ============================================================================

function addMessage(role, text) {
  if (!text || !messagesEl) return;
  
  // Remove any existing thinking indicators
  removeThinking();
  
  // Transition to chat feed if still on intro
  if (pageState === 'intro') {
    showChatFeedPage();
  }
  
  const el = document.createElement('div');
  el.className = `msg ${role}`;
  
  if (role === 'user') {
    el.textContent = text;
  } else {
    el.innerHTML = formatMessage(text);
  }
  
  messagesEl.appendChild(el);
  scrollToBottomIfNeeded();
  
  return el;
}

// Enhanced message click handling with context menu
messagesEl.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  
  const msgEl = e.target.closest('.msg');
  if (!msgEl) return;
  
  showMsgMenu(msgEl, e.clientX, e.clientY);
});

// Also handle long press on mobile
let longPressTimer = null;
messagesEl.addEventListener('touchstart', (e) => {
  const msgEl = e.target.closest('.msg');
  if (!msgEl) return;
  
  longPressTimer = setTimeout(() => {
    const touch = e.touches[0];
    showMsgMenu(msgEl, touch.clientX, touch.clientY);
    // Add haptic feedback if available
    if (navigator.vibrate) navigator.vibrate(50);
  }, 500);
});

messagesEl.addEventListener('touchend', () => {
  if (longPressTimer) {
    clearTimeout(longPressTimer);
    longPressTimer = null;
  }
});

function showMsgMenu(msgEl, x, y) {
  // Remove existing menu
  document.getElementById('msg-menu')?.remove();
  
  // Select the message
  document.querySelectorAll('.msg.selected').forEach(el => el.classList.remove('selected'));
  msgEl.classList.add('selected');
  
  // Create menu
  const menu = document.createElement('div');
  menu.id = 'msg-menu';
  menu.className = 'show';
  
  menu.innerHTML = `
    <button class="menu-btn" onclick="copyMessage()" title="Copy">
      <svg viewBox="0 0 24 24">
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
      </svg>
    </button>
    <button class="menu-btn delete" onclick="deleteMessage()" title="Delete">
      <svg viewBox="0 0 24 24">
        <polyline points="3 6 5 6 21 6"/>
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
      </svg>
    </button>
  `;
  
  // Position menu
  menu.style.left = x + 'px';
  menu.style.top = y + 'px';
  
  document.body.appendChild(menu);
  
  // Adjust position if it goes off screen
  const rect = menu.getBoundingClientRect();
  if (rect.right > window.innerWidth) {
    menu.style.left = (x - rect.width) + 'px';
  }
  if (rect.bottom > window.innerHeight) {
    menu.style.top = (y - rect.height) + 'px';
  }
  
  // Close menu on click outside
  const closeMenu = (e) => {
    if (!menu.contains(e.target)) {
      menu.remove();
      msgEl.classList.remove('selected');
      document.removeEventListener('click', closeMenu);
      document.removeEventListener('touchstart', closeMenu);
    }
  };
  setTimeout(() => {
    document.addEventListener('click', closeMenu);
    document.addEventListener('touchstart', closeMenu);
  }, 10);
}

function copyMessage() {
  const selectedMsg = document.querySelector('.msg.selected');
  if (!selectedMsg) return;
  
  navigator.clipboard.writeText(selectedMsg.textContent).then(() => {
    toast('Copied to clipboard');
  }).catch(() => {
    toast('Failed to copy', true);
  });
  
  // Close menu
  document.getElementById('msg-menu')?.remove();
  selectedMsg.classList.remove('selected');
}

function deleteMessage() {
  const selectedMsg = document.querySelector('.msg.selected');
  if (!selectedMsg) return;
  
  selectedMsg.remove();
  toast('Message deleted');
  
  // Close menu
  document.getElementById('msg-menu')?.remove();
  
  // Hide clear button if no messages left
  const messageCount = messagesEl.querySelectorAll('.msg').length;
  if (messageCount === 0) {
    clearChatBtn?.classList.remove('show');
  }
}

function formatMessage(text) {
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/`(.*?)`/g, '<code>$1</code>')
    .replace(/\n/g, '<br>')
    .replace(/💬 /g, ''); // Remove emoji prefixes if any
}

// Set processing state
function setProcessing(processing) {
  isProcessing = processing;
  updateSparkPillText(); // Update the indicator
}

function addThinking() {
  // Remove existing thinking indicator
  removeThinking();
  
  const el = document.createElement('div');
  el.id = 'thinking-indicator';
  el.className = 'msg thinking bot';
  el.innerHTML = `
    <div class="thinking-dots">
      <span></span>
      <span></span>
      <span></span>
    </div>
  `;
  messagesEl.appendChild(el);
  scrollToBottomIfNeeded();
}

function removeThinking() {
  document.getElementById('thinking-indicator')?.remove();
}

function setStatus(text) {
  if (statusEl) {
    statusEl.textContent = text;
    statusEl.classList.toggle('show', !!text);
  }
}

function toast(msg, isError = false) {
  toastEl.textContent = msg;
  toastEl.className = isError ? 'show error' : 'show';
  setTimeout(() => toastEl.className = '', 3000);
}

// ============================================================================
// VOICE MODE - DUAL SUPPORT (ElevenLabs + OpenAI)
// ============================================================================

// WebSocket connections for voice modes
let elevenLabsWs = null;
let openAiWs = null;

// Audio contexts for different voice modes
let elevenLabsAudioContext = null;
let openAiAudioContext = null;

// Media stream and recording
let voiceMediaStream = null;
let audioWorkletNode = null;

// Audio playback queues
let elevenLabsAudioQueue = [];
let openAiAudioQueue = [];
let isPlayingElevenLabs = false;
let isPlayingOpenAi = false;

// Voice transcript message helpers
let currentUserMsg = null;
let currentAssistantMsg = null;

// Waiting/thinking sound state
let thinkingAudio = null;
let thinkingInterval = null;

// Voice status indicators
function addVoiceMessage(role, text) {
  if (!voiceContent) return null;
  
  const msg = document.createElement('div');
  msg.className = `voice-msg ${role}`;
  msg.textContent = text;
  voiceContent.appendChild(msg);
  
  // Auto-scroll to bottom
  voiceContent.scrollTop = voiceContent.scrollHeight;
  
  return msg;
}

function updateVoiceStatus(text) {
  if (voiceStatus) {
    voiceStatus.textContent = text;
  }
}

// Create voice mode toggle UI
function createVoiceModeToggle() {
  if (document.getElementById('voice-mode-toggle')) return;
  
  const toggle = document.createElement('div');
  toggle.id = 'voice-mode-toggle';
  toggle.style.cssText = `
    position: fixed;
    top: 70px;
    right: 16px;
    background: var(--glass);
    backdrop-filter: blur(20px);
    border: 1px solid var(--glass-border);
    border-radius: 20px;
    padding: 4px;
    display: flex;
    gap: 4px;
    z-index: 20;
  `;
  
  const elevenBtn = document.createElement('button');
  elevenBtn.textContent = 'ElevenLabs';
  elevenBtn.style.cssText = `
    padding: 8px 12px;
    border: none;
    border-radius: 16px;
    background: ${voiceMode === 'elevenlabs' ? 'var(--accent)' : 'transparent'};
    color: ${voiceMode === 'elevenlabs' ? 'white' : 'var(--text-secondary)'};
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  `;
  
  const openaiBtn = document.createElement('button');
  openaiBtn.textContent = 'OpenAI';
  openaiBtn.style.cssText = `
    padding: 8px 12px;
    border: none;
    border-radius: 16px;
    background: ${voiceMode === 'openai' ? 'var(--accent)' : 'transparent'};
    color: ${voiceMode === 'openai' ? 'white' : 'var(--text-secondary)'};
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  `;
  
  elevenBtn.addEventListener('click', () => {
    voiceMode = 'elevenlabs';
    localStorage.setItem('voiceMode', voiceMode);
    updateVoiceModeToggle();
    console.log('🎙️ Voice mode set to ElevenLabs');
  });
  
  openaiBtn.addEventListener('click', () => {
    voiceMode = 'openai';
    localStorage.setItem('voiceMode', voiceMode);
    updateVoiceModeToggle();
    console.log('🎙️ Voice mode set to OpenAI');
  });
  
  toggle.appendChild(elevenBtn);
  toggle.appendChild(openaiBtn);
  document.body.appendChild(toggle);
}

function updateVoiceModeToggle() {
  const toggle = document.getElementById('voice-mode-toggle');
  if (!toggle) return;
  
  const elevenBtn = toggle.children[0];
  const openaiBtn = toggle.children[1];
  
  if (voiceMode === 'elevenlabs') {
    elevenBtn.style.background = 'var(--accent)';
    elevenBtn.style.color = 'white';
    openaiBtn.style.background = 'transparent';
    openaiBtn.style.color = 'var(--text-secondary)';
  } else {
    elevenBtn.style.background = 'transparent';
    elevenBtn.style.color = 'var(--text-secondary)';
    openaiBtn.style.background = 'var(--accent)';
    openaiBtn.style.color = 'white';
  }
}

// Load saved voice mode preference
const savedVoiceMode = localStorage.getItem('voiceMode');
if (savedVoiceMode && ['elevenlabs', 'openai'].includes(savedVoiceMode)) {
  voiceMode = savedVoiceMode;
}

// ============================================================================
// ELEVENLABS VOICE MODE
// ============================================================================

async function startElevenLabsVoice() {
  console.log('🎙️ Starting ElevenLabs voice mode');
  
  try {
    // Start audio capture
    if (!await startElevenLabsAudioCapture()) {
      return;
    }
    
    // Connect to ElevenLabs WebSocket
    connectElevenLabsWebSocket();
    
  } catch (error) {
    console.error('Failed to start ElevenLabs voice:', error);
    toast('Failed to start voice mode', true);
  }
}

function connectElevenLabsWebSocket() {
  const wsUrl = `${CONFIG.wsUrl}/elevenlabs-realtime`;
  console.log('🔗 Connecting to ElevenLabs WebSocket:', wsUrl);
  
  elevenLabsWs = new WebSocket(wsUrl);
  
  elevenLabsWs.onopen = () => {
    console.log('✅ ElevenLabs WebSocket connected');
    updateVoiceStatus('Starting...');
  };
  
  elevenLabsWs.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      handleElevenLabsMessage(msg);
    } catch (e) {
      console.error('Failed to parse ElevenLabs message:', e);
    }
  };
  
  elevenLabsWs.onclose = (event) => {
    console.log('🔌 ElevenLabs WebSocket closed:', event.code);
    if (isListening) {
      toast('ElevenLabs connection lost', true);
    }
  };
  
  elevenLabsWs.onerror = (error) => {
    console.error('❌ ElevenLabs WebSocket error:', error);
    toast('ElevenLabs connection error', true);
  };
}

function handleElevenLabsMessage(msg) {
  console.log('📨 ElevenLabs message:', msg.type);
  
  switch (msg.type) {
    case 'ready':
      console.log('🎙️ ElevenLabs session ready');
      updateVoiceStatus('Listening');
      break;
      
    case 'transcript':
      // User's transcribed speech
      if (msg.text && voiceContent) {
        if (!currentUserMsg) {
          currentUserMsg = addVoiceMessage('user', msg.text);
        } else {
          currentUserMsg.textContent = msg.text;
        }
        voiceContent.scrollTop = voiceContent.scrollHeight;
      }
      break;
      
    case 'text':
    case 'agent_response':
      // Agent's text response
      const content = msg.content || msg.text;
      if (content) {
        if (!currentAssistantMsg) {
          currentAssistantMsg = addVoiceMessage('assistant', content);
        } else {
          currentAssistantMsg.textContent = content;
          currentAssistantMsg.classList.remove('thinking');
        }
        updateVoiceStatus('Speaking...');
      }
      break;
      
    case 'audio_delta':
    case 'audio':
      // Audio chunk from ElevenLabs
      const audioData = msg.data || msg.audio_base_64;
      if (audioData) {
        elevenLabsAudioQueue.push(audioData);
        playElevenLabsAudioQueue();
      }
      break;
      
    case 'interruption':
      console.log('⚡ User interruption detected');
      stopElevenLabsAudioPlayback();
      currentUserMsg = null;
      currentAssistantMsg = null;
      break;
      
    case 'tool_call':
      console.log('🔧 Tool call:', msg.name);
      updateVoiceStatus('Checking...');
      if (!currentAssistantMsg) {
        currentAssistantMsg = addVoiceMessage('assistant', 'Checking...');
        currentAssistantMsg.classList.add('thinking');
      }
      break;
      
    case 'conversation_ended':
    case 'session_ended':
      console.log('🏁 ElevenLabs conversation ended');
      break;
      
    case 'error':
      console.error('❌ ElevenLabs error:', msg.message);
      toast(msg.message || 'ElevenLabs error', true);
      break;
      
    default:
      // Log unknown events for debugging
      if (msg.type && !msg.type.includes('_delta')) {
        console.log(`📨 Unknown ElevenLabs event: ${msg.type}`);
      }
  }
}

async function startElevenLabsAudioCapture() {
  try {
    // Request microphone access
    voiceMediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        sampleRate: 16000,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true
      }
    });
    
    // Create audio context for ElevenLabs (16kHz)
    elevenLabsAudioContext = new (window.AudioContext || window.webkitAudioContext)({ 
      sampleRate: 16000 
    });
    
    const source = elevenLabsAudioContext.createMediaStreamSource(voiceMediaStream);
    
    // Use AudioWorkletNode for better audio processing
    try {
      await elevenLabsAudioContext.audioWorklet.addModule('/audio-processor.js');
      audioWorkletNode = new AudioWorkletNode(elevenLabsAudioContext, 'audio-processor');
      
      audioWorkletNode.port.onmessage = (event) => {
        const { audioData } = event.data;
        if (elevenLabsWs && elevenLabsWs.readyState === WebSocket.OPEN) {
          // Convert Float32Array to base64 PCM 16-bit
          const base64Audio = float32ToPCM16Base64(audioData);
          elevenLabsWs.send(JSON.stringify({
            type: 'audio',
            data: base64Audio
          }));
        }
      };
      
      source.connect(audioWorkletNode);
      audioWorkletNode.connect(elevenLabsAudioContext.destination);
      
    } catch (workletError) {
      console.warn('AudioWorklet not available, falling back to ScriptProcessor');
      // Fallback to ScriptProcessor
      const processor = elevenLabsAudioContext.createScriptProcessor(4096, 1, 1);
      processor.onaudioprocess = (event) => {
        const inputData = event.inputBuffer.getChannelData(0);
        if (elevenLabsWs && elevenLabsWs.readyState === WebSocket.OPEN) {
          const base64Audio = float32ToPCM16Base64(inputData);
          elevenLabsWs.send(JSON.stringify({
            type: 'audio',
            data: base64Audio
          }));
        }
      };
      
      source.connect(processor);
      processor.connect(elevenLabsAudioContext.destination);
    }
    
    // Start waveform animation
    startWaveAnimation();
    
    return true;
    
  } catch (error) {
    console.error('ElevenLabs audio capture error:', error);
    if (error.name === 'NotAllowedError') {
      toast('Microphone permission denied', true);
    } else if (error.name === 'NotFoundError') {
      toast('No microphone found', true);
    } else {
      toast('Microphone error: ' + error.message, true);
    }
    return false;
  }
}

// Convert Float32Array to PCM 16-bit base64 (ElevenLabs format)
function float32ToPCM16Base64(float32Array) {
  const pcm16 = new Int16Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  const bytes = new Uint8Array(pcm16.buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// Convert base64 PCM 16-bit to Float32Array (ElevenLabs format)
function base64PCM16ToFloat32(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const pcm16 = new Int16Array(bytes.buffer);
  const float32 = new Float32Array(pcm16.length);
  for (let i = 0; i < pcm16.length; i++) {
    float32[i] = pcm16[i] / (pcm16[i] < 0 ? 0x8000 : 0x7FFF);
  }
  return float32;
}

// Play audio from ElevenLabs queue
async function playElevenLabsAudioQueue() {
  if (isPlayingElevenLabs || elevenLabsAudioQueue.length === 0) return;
  isPlayingElevenLabs = true;
  
  while (elevenLabsAudioQueue.length > 0) {
    const audioData = elevenLabsAudioQueue.shift();
    try {
      if (!elevenLabsAudioContext || elevenLabsAudioContext.state === 'closed') {
        elevenLabsAudioContext = new (window.AudioContext || window.webkitAudioContext)({ 
          sampleRate: 16000 
        });
      }
      
      const float32 = base64PCM16ToFloat32(audioData);
      const audioBuffer = elevenLabsAudioContext.createBuffer(1, float32.length, 16000);
      audioBuffer.getChannelData(0).set(float32);
      
      const source = elevenLabsAudioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(elevenLabsAudioContext.destination);
      
      await new Promise(resolve => {
        source.onended = resolve;
        source.start();
      });
    } catch (e) {
      console.error('ElevenLabs audio playback error:', e);
    }
  }
  
  isPlayingElevenLabs = false;
}

function stopElevenLabsAudioPlayback() {
  elevenLabsAudioQueue = [];
  isPlayingElevenLabs = false;
  if (elevenLabsAudioContext && elevenLabsAudioContext.state !== 'closed') {
    elevenLabsAudioContext.close().catch(() => {});
  }
}

function stopElevenLabsVoice() {
  console.log('🔌 Stopping ElevenLabs voice mode');
  
  // Stop audio capture
  if (voiceMediaStream) {
    voiceMediaStream.getTracks().forEach(track => track.stop());
    voiceMediaStream = null;
  }
  
  if (audioWorkletNode) {
    audioWorkletNode.disconnect();
    audioWorkletNode = null;
  }
  
  if (elevenLabsAudioContext && elevenLabsAudioContext.state !== 'closed') {
    elevenLabsAudioContext.close().catch(() => {});
    elevenLabsAudioContext = null;
  }
  
  // Stop audio playback
  stopElevenLabsAudioPlayback();
  
  // Close WebSocket
  if (elevenLabsWs) {
    elevenLabsWs.send(JSON.stringify({ type: 'end' }));
    elevenLabsWs.close();
    elevenLabsWs = null;
  }
  
  // Reset message state
  currentUserMsg = null;
  currentAssistantMsg = null;
  
  stopWaveAnimation();
}

// ============================================================================
// OPENAI VOICE MODE (LEGACY - KEEP FOR FALLBACK)
// ============================================================================

let realtimeWs = null;
let realtimeAudioContext = null;
let realtimeMediaStream = null;
let realtimeScriptProcessor = null;
let realtimePlaybackContext = null;

// Create a simple, gentle thinking sound
function createThinkingSound() {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const sampleRate = ctx.sampleRate;
  const duration = 0.3; // Short 300ms pulse
  const samples = duration * sampleRate;
  const buffer = ctx.createBuffer(1, samples, sampleRate);
  const data = buffer.getChannelData(0);
  
  // Simple soft "ping" sound
  for (let i = 0; i < samples; i++) {
    const t = i / sampleRate;
    // Single gentle tone at 880Hz (A5)
    const freq = 880;
    // Quick fade out envelope
    const env = Math.exp(-8 * t / duration);
    // Simple sine wave
    data[i] = env * 0.2 * Math.sin(2 * Math.PI * freq * t);
  }
  
  return { ctx, buffer };
}

// Play the thinking sound in a loop
function playWaitingSound() {
  if (thinkingInterval) return; // Already playing
  
  console.log('🔊 Thinking sound started');
  
  // Play initial sound
  playThinkingPulse();
  
  // Loop every 2 seconds (less frequent, less annoying)
  thinkingInterval = setInterval(playThinkingPulse, 2000);
}

function playThinkingPulse() {
  let ctx = null;
  try {
    const result = createThinkingSound();
    ctx = result.ctx;
    const buffer = result.buffer;
    const source = ctx.createBufferSource();
    const gain = ctx.createGain();
    
    source.buffer = buffer;
    gain.gain.setValueAtTime(0.2, ctx.currentTime); // Gentle volume
    
    source.connect(gain);
    gain.connect(ctx.destination);
    source.start();
    
    // Clean up after playing
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
      ctx.close().catch(() => {});
    };
  } catch (e) {
    console.error('Thinking sound error:', e);
    // Close context on error to prevent memory leak
    if (ctx && ctx.state !== 'closed') {
      ctx.close().catch(() => {});
    }
  }
}

// Stop the thinking sound
function stopWaitingSound() {
  if (thinkingInterval) {
    clearInterval(thinkingInterval);
    thinkingInterval = null;
    console.log('🔇 Thinking sound stopped');
  }
}

// Build realtime WebSocket URL for OpenAI
function getRealtimeWsUrl() {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const base = `${protocol}//${location.host}`;
  const path = location.pathname.replace(/\/+$/, '');
  return path && path !== '/' ? `${base}${path}/realtime` : `${base}/realtime`;
}

// OpenAI realtime functions (legacy)
function connectOpenAiRealtime() {
  const wsUrl = getRealtimeWsUrl();
  console.log('🔗 Connecting to OpenAI Realtime:', wsUrl);
  
  realtimeWs = new WebSocket(wsUrl);
  
  realtimeWs.onopen = () => {
    console.log('✅ OpenAI Realtime connected');
    updateVoiceStatus('Starting...');
  };
  
  realtimeWs.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      handleOpenAiRealtimeMessage(msg);
    } catch (e) {
      console.error('Failed to parse OpenAI message:', e);
    }
  };
  
  realtimeWs.onclose = (event) => {
    console.log('🔌 OpenAI Realtime closed:', event.code);
    if (isListening) {
      toast('OpenAI connection lost', true);
    }
  };
  
  realtimeWs.onerror = (error) => {
    console.error('❌ OpenAI Realtime error:', error);
    toast('OpenAI connection error', true);
  };
}

function handleOpenAiRealtimeMessage(msg) {
  switch (msg.type) {
    case 'ready':
      const modeLabel = msg.mode === 'hybrid' ? 'Hybrid (Claude)' : 'Direct';
      console.log(`🎙️ OpenAI Realtime session ready - Mode: ${modeLabel}`);
      updateVoiceStatus('Listening');
      break;
      
    case 'user_speaking':
      setVoiceActive(true);
      updateVoiceStatus('Hearing you...');
      // Stop any playing audio when user speaks (interruption)
      stopOpenAiAudioPlayback();
      stopWaitingSound();
      // Reset for new turn
      currentUserMsg = null;
      currentAssistantMsg = null;
      break;
      
    case 'user_stopped':
      setVoiceActive(false);
      updateVoiceStatus('Processing...');
      // Start thinking sound when user stops speaking
      playWaitingSound();
      break;
      
    case 'interim':
    case 'transcript':
      // User's transcribed speech
      stopWaitingSound();
      if (msg.text && voiceContent) {
        if (!currentUserMsg) {
          // Create user message element
          const userMsg = document.createElement('div');
          userMsg.className = 'voice-msg user';
          userMsg.textContent = msg.text;
          
          // If assistant already started responding, insert BEFORE it
          if (currentAssistantMsg && currentAssistantMsg.parentNode === voiceContent) {
            voiceContent.insertBefore(userMsg, currentAssistantMsg);
          } else {
            voiceContent.appendChild(userMsg);
          }
          currentUserMsg = userMsg;
        } else {
          currentUserMsg.textContent = msg.text;
        }
        voiceContent.scrollTop = voiceContent.scrollHeight;
      }
      playWaitingSound();
      break;
    
    case 'processing':
      // Hybrid mode: processing with Spark Opus
      const engineName = msg.engine || 'Spark Opus';
      const statusMsg = msg.message || `Checking with ${engineName}...`;
      console.log(`🧠 ${statusMsg}`);
      updateVoiceStatus(statusMsg);
      playWaitingSound();
      if (!currentAssistantMsg) {
        currentAssistantMsg = addVoiceMessage('assistant', statusMsg);
        currentAssistantMsg.classList.add('thinking');
      } else {
        currentAssistantMsg.textContent = statusMsg;
        currentAssistantMsg.classList.add('thinking');
      }
      break;
      
    case 'text_delta':
      // AI response streaming text (legacy mode)
      stopWaitingSound();
      updateVoiceStatus('Speaking...');
      if (msg.delta) {
        if (!currentAssistantMsg) {
          currentAssistantMsg = addVoiceMessage('assistant', msg.delta);
        } else {
          currentAssistantMsg.textContent += msg.delta;
          currentAssistantMsg.classList.remove('thinking');
        }
        // Auto-scroll
        if (voiceContent) voiceContent.scrollTop = voiceContent.scrollHeight;
      }
      break;
      
    case 'text':
      // Full AI response text
      stopWaitingSound();
      if (msg.content) {
        if (!currentAssistantMsg) {
          currentAssistantMsg = addVoiceMessage('assistant', msg.content);
        } else {
          currentAssistantMsg.textContent = msg.content;
          currentAssistantMsg.classList.remove('thinking');
        }
      }
      break;
    
    case 'tts_start':
      // Hybrid mode: TTS generation starting
      console.log('🔊 Generating speech...');
      updateVoiceStatus('Speaking...');
      stopWaitingSound();
      break;
    
    case 'audio_chunk':
      // Hybrid mode: audio chunk (TTS API format - needs conversion)
      stopWaitingSound();
      updateVoiceStatus('Speaking...');
      if (msg.data) {
        // Queue audio chunk for playback
        openAiAudioQueue.push(msg.data);
        playOpenAiAudioQueueTTS();
      }
      break;
      
    case 'audio_delta':
      // Audio chunk from AI (legacy mode - PCM16)
      stopWaitingSound();
      updateVoiceStatus('Speaking...');
      if (msg.data) {
        openAiAudioQueue.push(msg.data);
        playOpenAiAudioQueue();
      }
      break;
      
    case 'audio_done':
      console.log('🔊 Audio complete');
      break;
      
    case 'tool_call':
      // Tool is being executed - show feedback and play waiting sound
      console.log('🔧 Tool call:', msg.name);
      const toolName = msg.name?.replace('get_', '').replace('ask_', '').replace('_', ' ') || 'info';
      updateVoiceStatus(`Checking ${toolName}...`);
      // Add a thinking message
      if (!currentAssistantMsg) {
        currentAssistantMsg = addVoiceMessage('assistant', `Checking ${toolName}...`);
        currentAssistantMsg.classList.add('thinking');
      }
      playWaitingSound();
      break;
      
    case 'done':
      // Response complete - reset for next turn (but keep messages!)
      stopWaitingSound();
      currentUserMsg = null;
      currentAssistantMsg = null;
      updateVoiceStatus('Listening');
      break;
      
    case 'error':
      stopWaitingSound();
      console.error('OpenAI Realtime error:', msg.message);
      toast(msg.message || 'Voice error', true);
      updateVoiceStatus('Error');
      break;
      
    case 'disconnected':
      stopWaitingSound();
      if (isListening) {
        toast('Disconnected', true);
      }
      break;
  }
}

// OpenAI audio functions
async function startOpenAiAudioCapture() {
  try {
    realtimeAudioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 });
    
    try {
      realtimeMediaStream = await navigator.mediaDevices.getUserMedia({ 
        audio: { 
          sampleRate: 24000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true
        } 
      });
    } catch (micError) {
      if (micError.name === 'NotAllowedError') {
        toast('Microphone permission denied. Please allow access.', true);
      } else if (micError.name === 'NotFoundError') {
        toast('No microphone found', true);
      } else {
        toast('Microphone error: ' + micError.message, true);
      }
      console.error('Microphone access error:', micError);
      
      if (realtimeAudioContext) {
        realtimeAudioContext.close().catch(() => {});
        realtimeAudioContext = null;
      }
      return false;
    }
    
    const source = realtimeAudioContext.createMediaStreamSource(realtimeMediaStream);
    
    // Add analyser for wave visualization
    analyserNode = realtimeAudioContext.createAnalyser();
    analyserNode.fftSize = 256;
    source.connect(analyserNode);
    
    // Start wave animation
    startWaveAnimation();
    
    // Use ScriptProcessorNode for capturing audio (deprecated but widely supported)
    realtimeScriptProcessor = realtimeAudioContext.createScriptProcessor(4096, 1, 1);
    
    realtimeScriptProcessor.onaudioprocess = (e) => {
      if (realtimeWs && realtimeWs.readyState === WebSocket.OPEN) {
        const inputData = e.inputBuffer.getChannelData(0);
        
        // Calculate RMS volume
        let sum = 0;
        for (let i = 0; i < inputData.length; i++) {
          sum += inputData[i] * inputData[i];
        }
        const volume = Math.sqrt(sum / inputData.length);
        
        // Only send if there's some audio activity
        if (volume > 0.001) {
          const base64Audio = openAiFloat32ToBase64PCM16(inputData);
          realtimeWs.send(JSON.stringify({
            type: 'audio',
            data: base64Audio
          }));
        }
      }
    };
    
    source.connect(realtimeScriptProcessor);
    realtimeScriptProcessor.connect(realtimeAudioContext.destination);
    
    return true;
    
  } catch (error) {
    console.error('OpenAI audio capture error:', error);
    toast('Failed to start audio capture', true);
    return false;
  }
}

// Convert Float32Array to base64 PCM16 (OpenAI format)
function openAiFloat32ToBase64PCM16(float32Array) {
  const pcm16 = new Int16Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  const bytes = new Uint8Array(pcm16.buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// Convert base64 PCM16 to Float32Array (OpenAI format)
function openAiBase64PCM16ToFloat32(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const pcm16 = new Int16Array(bytes.buffer);
  const float32 = new Float32Array(pcm16.length);
  for (let i = 0; i < pcm16.length; i++) {
    float32[i] = pcm16[i] / (pcm16[i] < 0 ? 0x8000 : 0x7FFF);
  }
  return float32;
}

// Play audio from queue (PCM16 format - legacy realtime mode)
async function playOpenAiAudioQueue() {
  if (isPlayingOpenAi || openAiAudioQueue.length === 0) return;
  isPlayingOpenAi = true;
  
  while (openAiAudioQueue.length > 0) {
    const audioData = openAiAudioQueue.shift();
    try {
      if (!realtimePlaybackContext) {
        realtimePlaybackContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 });
      }
      
      const float32 = openAiBase64PCM16ToFloat32(audioData);
      const audioBuffer = realtimePlaybackContext.createBuffer(1, float32.length, 24000);
      audioBuffer.getChannelData(0).set(float32);
      
      const source = realtimePlaybackContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(realtimePlaybackContext.destination);
      
      await new Promise(resolve => {
        source.onended = resolve;
        source.start();
      });
    } catch (e) {
      console.error('Audio playback error:', e);
    }
  }
  
  await new Promise(r => setTimeout(r, 100));
  isPlayingOpenAi = false;
}

// TTS audio buffer for reassembly
let ttsAudioBuffer = [];

// Play audio from queue (TTS API format - hybrid mode)
async function playOpenAiAudioQueueTTS() {
  if (isPlayingOpenAi) return;
  
  // Collect all chunks first (TTS chunks need to be played together)
  while (openAiAudioQueue.length > 0) {
    ttsAudioBuffer.push(openAiAudioQueue.shift());
  }
  
  // If we have accumulated audio, play it
  if (ttsAudioBuffer.length > 0) {
    isPlayingOpenAi = true;
    let ctx = null;
    
    try {
      // Combine all base64 chunks
      const combinedBase64 = ttsAudioBuffer.join('');
      ttsAudioBuffer = [];
      
      // Convert base64 to raw bytes
      const binary = atob(combinedBase64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      
      // OpenAI TTS PCM format: 24000Hz, 16-bit signed little-endian
      const pcm16 = new Int16Array(bytes.buffer);
      const float32 = new Float32Array(pcm16.length);
      for (let i = 0; i < pcm16.length; i++) {
        float32[i] = pcm16[i] / (pcm16[i] < 0 ? 0x8000 : 0x7FFF);
      }
      
      // Create audio context and play
      ctx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 });
      const audioBuffer = ctx.createBuffer(1, float32.length, 24000);
      audioBuffer.getChannelData(0).set(float32);
      
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);
      
      await new Promise(resolve => {
        source.onended = () => {
          ctx.close().catch(() => {});
          resolve();
        };
        source.start();
      });
      
      // Notify server that playback finished
      if (realtimeWs && realtimeWs.readyState === WebSocket.OPEN) {
        realtimeWs.send(JSON.stringify({ type: 'audio_playback_ended' }));
        console.log('🔊 Notified OpenAI server: playback ended');
      }
      
    } catch (e) {
      console.error('TTS playback error:', e);
      if (ctx && ctx.state !== 'closed') {
        ctx.close().catch(() => {});
      }
      if (realtimeWs && realtimeWs.readyState === WebSocket.OPEN) {
        realtimeWs.send(JSON.stringify({ type: 'audio_playback_ended' }));
      }
    }
    
    await new Promise(r => setTimeout(r, 100));
    isPlayingOpenAi = false;
  }
}

// Stop audio playback
function stopOpenAiAudioPlayback() {
  openAiAudioQueue = [];
  isPlayingOpenAi = false;
  if (realtimePlaybackContext) {
    realtimePlaybackContext.close().catch(() => {});
    realtimePlaybackContext = null;
  }
}

function stopOpenAiVoice() {
  console.log('🔌 Stopping OpenAI voice mode');
  
  // Stop audio capture
  if (realtimeMediaStream) {
    realtimeMediaStream.getTracks().forEach(track => track.stop());
    realtimeMediaStream = null;
  }
  
  if (realtimeScriptProcessor) {
    realtimeScriptProcessor.disconnect();
    realtimeScriptProcessor = null;
  }
  
  if (realtimeAudioContext && realtimeAudioContext.state !== 'closed') {
    realtimeAudioContext.close().catch(() => {});
    realtimeAudioContext = null;
  }
  
  // Stop playback
  stopOpenAiAudioPlayback();
  
  // Close WebSocket
  if (realtimeWs) {
    realtimeWs.send(JSON.stringify({ type: 'stop' }));
    realtimeWs.close();
    realtimeWs = null;
  }
  
  // Reset message state
  currentUserMsg = null;
  currentAssistantMsg = null;
}

// Wave animation state (CSS-based, JS just tracks analyser for speaking detection)
let waveAnimationFrame = null;
let analyserNode = null;

// Start monitoring audio for speaking detection
function startWaveAnimation() {
  // CSS handles the actual animation, we just detect speaking state
  function checkSpeaking() {
    if (analyserNode) {
      const dataArray = new Uint8Array(analyserNode.frequencyBinCount);
      analyserNode.getByteFrequencyData(dataArray);
      
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i];
      }
      const amplitude = (sum / dataArray.length) / 255;
      const isSpeaking = amplitude > 0.05;
      
      // Toggle speaking class on voice-bar
      const voiceBar = document.getElementById('voice-bar');
      if (voiceBar) {
        voiceBar.classList.toggle('speaking', isSpeaking);
      }
    }
    waveAnimationFrame = requestAnimationFrame(checkSpeaking);
  }
  checkSpeaking();
}

// Stop wave animation monitoring
function stopWaveAnimation() {
  if (waveAnimationFrame) {
    cancelAnimationFrame(waveAnimationFrame);
    waveAnimationFrame = null;
  }
  const voiceBar = document.getElementById('voice-bar');
  if (voiceBar) {
    voiceBar.classList.remove('speaking');
  }
}

// ============================================================================
// UNIFIED VOICE INTERFACE
// ============================================================================

function startVoice() {
  mode = 'voice';
  isListening = true;
  document.body.classList.add('voice-mode');
  bottomEl?.classList.add('voice-active');
  
  // Reset message state
  currentUserMsg = null;
  currentAssistantMsg = null;
  
  // Update status indicator
  updateVoiceStatus('Connecting...');
  setStatus('Connecting...');
  
  // Create mode toggle in voice mode
  createVoiceModeToggle();
  
  // Start the appropriate voice mode
  if (voiceMode === 'elevenlabs') {
    startElevenLabsVoice();
  } else {
    // OpenAI fallback
    connectOpenAiRealtime();
    startOpenAiAudioCapture();
  }
}

function stopVoice() {
  isListening = false;
  document.body.classList.remove('voice-mode');
  bottomEl?.classList.remove('voice-active');
  voiceBar?.classList.remove('speaking');
  
  // Remove mode toggle
  document.getElementById('voice-mode-toggle')?.remove();
  
  // Stop the appropriate voice mode
  if (voiceMode === 'elevenlabs') {
    stopElevenLabsVoice();
  } else {
    stopOpenAiVoice();
  }
  
  // Stop common voice elements
  stopWaitingSound();
  stopWaveAnimation();
  
  mode = 'chat';
}

function setVoiceActive(active) {
  voiceBar?.classList.toggle('speaking', active);
}

voiceBtn?.addEventListener('click', startVoice);
closeVoiceBtn?.addEventListener('click', stopVoice);

// ============================================================================
// CHAT MODE
// ============================================================================

textInput?.addEventListener('input', () => {
  const hasText = textInput.value.trim().length > 0 || pendingAttachment;
  sendBtn?.classList.toggle('show', hasText);
  voiceBtn?.classList.toggle('hidden', hasText);
  
  // Auto-resize textarea
  if (textInput) {
    textInput.style.height = 'auto';
    textInput.style.height = Math.min(textInput.scrollHeight, 120) + 'px';
  }
});

textInput?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    submitText();
  }
});

textInput?.addEventListener('focus', () => {
  if (isListening) stopVoice();
  mode = 'chat';
  bottomEl?.classList.add('focused');
});

textInput?.addEventListener('blur', () => {
  setTimeout(() => {
    if (document.activeElement !== textInput) {
      bottomEl?.classList.remove('focused');
    }
  }, 100);
});

sendBtn?.addEventListener('click', submitText);

async function submitText() {
  const text = textInput?.value.trim();
  if (!text || isProcessing) return;
  textInput.value = '';
  textInput.style.height = 'auto'; // Reset height
  sendBtn?.classList.remove('show');
  voiceBtn?.classList.remove('hidden'); // Reset voice button visibility
  await send(text, 'chat');
}

// ============================================================================
// NOTES MODE
// ============================================================================

async function initRecorder() {
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(mediaStream);
    mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunks.push(e.data); };
    mediaRecorder.onstop = finishRecording;
    return true;
  } catch {
    toast('Mic access denied', true);
    return false;
  }
}

function releaseMicrophone() {
  mediaStream?.getTracks().forEach(t => t.stop());
  mediaStream = null;
  mediaRecorder = null;
}

function startRecording() {
  if (!mediaRecorder) {
    initRecorder().then(ok => ok && startRecording());
    return;
  }
  audioChunks = [];
  mediaRecorder.start();
  recordStart = Date.now();
  mode = 'notes';
  document.body.classList.add('notes-mode');
  bottomEl?.classList.add('notes-active');
  timerInterval = setInterval(updateTimer, 1000);
  updateTimer();
}

function stopRecording() {
  if (!mediaRecorder || mediaRecorder.state === 'inactive') return;
  mediaRecorder.stop();
  clearInterval(timerInterval);
  document.body.classList.remove('notes-mode');
  bottomEl?.classList.remove('notes-active');
  mode = 'chat';
}

function deleteRecording() {
  stopRecording();
  audioChunks = [];
  toast('Recording deleted');
  releaseMicrophone();
}

async function finishRecording() {
  if (audioChunks.length === 0) {
    releaseMicrophone();
    return;
  }
  
  const blob = new Blob(audioChunks, { type: 'audio/wav' });
  const duration = Math.round((Date.now() - recordStart) / 1000);
  
  // Create FormData with the audio file
  const formData = new FormData();
  formData.append('audio', blob, `voice-note-${Date.now()}.wav`);
  formData.append('duration', duration.toString());
  
  try {
    setProcessing(true);
    setStatus('Transcribing...');
    
    const res = await fetch('/api/transcribe', {
      method: 'POST',
      body: formData
    });
    
    if (!res.ok) throw new Error('Transcription failed');
    
    const data = await res.json();
    
    if (data.transcript) {
      // Send the transcribed text as a regular message
      await send(data.transcript, 'notes', duration);
      toast(`Notes transcribed (${duration}s)`);
    } else {
      throw new Error('No transcript received');
    }
    
  } catch (e) {
    console.error('Transcription error:', e);
    toast('Transcription failed', true);
  } finally {
    setProcessing(false);
    setStatus('');
    audioChunks = [];
    releaseMicrophone();
  }
}

function updateTimer() {
  if (!recordStart) return;
  const elapsed = Math.floor((Date.now() - recordStart) / 1000);
  const mins = Math.floor(elapsed / 60).toString().padStart(2, '0');
  const secs = (elapsed % 60).toString().padStart(2, '0');
  const display = `${mins}:${secs}`;
  
  if (notesTimerEl) notesTimerEl.textContent = display;
  if (timerEl) timerEl.textContent = display;
}

notesBtn?.addEventListener('click', startRecording);
closeNotesBtn?.addEventListener('click', stopRecording);
deleteNotesBtn?.addEventListener('click', deleteRecording);

// ============================================================================
// FILE UPLOAD
// ============================================================================

let pendingAttachment = null;

uploadBtn?.addEventListener('click', () => {
  fileInput?.click();
});

fileInput?.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  
  // Reset the input so the same file can be selected again
  fileInput.value = '';
  
  // Check file size (10MB limit)
  if (file.size > 10 * 1024 * 1024) {
    toast('File too large (max 10MB)', true);
    return;
  }
  
  pendingAttachment = file;
  updateFileUploadUI();
});

function updateFileUploadUI() {
  const hasText = textInput?.value.trim().length > 0;
  const hasFile = pendingAttachment !== null;
  const hasContent = hasText || hasFile;
  
  sendBtn?.classList.toggle('show', hasContent);
  voiceBtn?.classList.toggle('hidden', hasContent);
  
  // Show file indicator
  if (hasFile && uploadBtn) {
    uploadBtn.style.opacity = '1';
    uploadBtn.style.background = 'var(--green)';
    uploadBtn.querySelector('svg').style.stroke = 'white';
    uploadBtn.title = `File: ${pendingAttachment.name}`;
  } else if (uploadBtn) {
    uploadBtn.style.opacity = '';
    uploadBtn.style.background = '';
    uploadBtn.querySelector('svg').style.stroke = '';
    uploadBtn.title = 'Attach file';
  }
}

function clearPendingAttachment() {
  pendingAttachment = null;
  updateFileUploadUI();
}

// ============================================================================
// SEND MESSAGE
// ============================================================================

async function send(text, messageMode = 'chat', duration = null) {
  if (!text && !pendingAttachment) return;
  if (isProcessing) return;
  
  // Add user message to UI immediately if it's text
  if (text) {
    addMessage('user', text);
  }
  
  // Create message object
  const message = {
    type: 'message',
    text: text || '',
    mode: messageMode,
    sparkMode: currentSparkMode, // Include current mode
    timestamp: Date.now()
  };
  
  // Add duration for notes
  if (duration !== null) {
    message.duration = duration;
  }
  
  try {
    setProcessing(true);
    addThinking();
    
    if (pendingAttachment) {
      // Send file via FormData
      const formData = new FormData();
      formData.append('file', pendingAttachment);
      formData.append('message', JSON.stringify(message));
      
      const res = await fetch('/api/messages/upload', {
        method: 'POST',
        body: formData
      });
      
      if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
      
    } else {
      // Send text message via WebSocket if connected, fallback to fetch
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(message));
      } else {
        const res = await fetch('/api/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(message)
        });
        
        if (!res.ok) throw new Error(`Message failed: ${res.status}`);
      }
    }
    
    clearPendingAttachment();
    
  } catch (e) {
    console.error('Send error:', e);
    toast('Failed to send message', true);
    removeThinking();
    setProcessing(false);
  }
}

// ============================================================================
// SCROLLING
// ============================================================================

function scrollToBottom() {
  if (messagesEl) {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }
}

function scrollToBottomIfNeeded() {
  if (!messagesEl) return;
  
  const { scrollTop, scrollHeight, clientHeight } = messagesEl;
  const isNearBottom = scrollTop + clientHeight >= scrollHeight - 100;
  
  if (isNearBottom) {
    scrollToBottom();
  }
}

// ============================================================================
// SHORTCUTS & ACTIONS
// ============================================================================

// Mode shortcuts
document.getElementById('devteam-btn')?.addEventListener('click', () => enterMode('dev'));
document.getElementById('researcher-btn')?.addEventListener('click', () => enterMode('research'));
document.getElementById('plan-btn')?.addEventListener('click', () => enterMode('plan'));
document.getElementById('todays-reports-btn')?.addEventListener('click', () => enterMode('dailyreports'));

// Other shortcuts
document.getElementById('articulate-btn')?.addEventListener('click', () => {
  textInput?.focus();
  textInput.placeholder = "What would you like me to help you articulate?";
  articulationsMode = true;
});

document.getElementById('videogen-btn')?.addEventListener('click', () => {
  showVideoGenModal();
});

// ============================================================================
// CLEAR CHAT BUTTON & FUNCTIONALITY
// ============================================================================

const clearChatBtn = document.getElementById('clear-chat-btn');

clearChatBtn?.addEventListener('click', async () => {
  if (!confirm('Clear all messages from this chat?')) return;
  
  try {
    const res = await fetch('/api/messages/clear', { method: 'POST' });
    if (!res.ok) throw new Error('Failed to clear messages');
    
    // Clear UI messages
    messagesEl.querySelectorAll('.msg').forEach(el => el.remove());
    clearChatBtn.classList.remove('show');
    
    // Reset preloaded history
    preloadedHistory = [];
    historyRendered = false;
    
    // Show intro page
    showIntroPage();
    
    toast('Chat cleared');
    
  } catch (e) {
    console.error('Clear chat error:', e);
    toast('Failed to clear chat', true);
  }
});

// ============================================================================
// HISTORY PANEL FUNCTIONS
// ============================================================================

function removeHistoryStatus() {
  document.getElementById('history-status')?.remove();
}

// ============================================================================
// BOTTOM SHEET MODAL SYSTEM
// ============================================================================

function showBottomSheet(config) {
  // Remove existing sheet
  const existing = document.querySelector('.bottom-sheet-overlay');
  if (existing) existing.remove();
  
  // Create overlay
  const overlay = document.createElement('div');
  overlay.className = 'bottom-sheet-overlay';
  
  // Create sheet
  const sheet = document.createElement('div');
  sheet.className = 'bottom-sheet';
  
  // Drag handle
  const handle = document.createElement('div');
  handle.className = 'bottom-sheet-handle';
  sheet.appendChild(handle);
  
  // Header with icon, title, subtitle
  const header = document.createElement('div');
  header.className = 'bottom-sheet-header';
  
  if (config.icon) {
    const icon = document.createElement('div');
    icon.className = 'bottom-sheet-icon';
    icon.textContent = config.icon;
    header.appendChild(icon);
  }
  
  const titles = document.createElement('div');
  titles.className = 'bottom-sheet-titles';
  
  const title = document.createElement('h3');
  title.className = 'bottom-sheet-title';
  title.textContent = config.title;
  titles.appendChild(title);
  
  if (config.subtitle) {
    const subtitle = document.createElement('div');
    subtitle.className = 'bottom-sheet-subtitle';
    subtitle.textContent = config.subtitle;
    titles.appendChild(subtitle);
  }
  
  header.appendChild(titles);
  sheet.appendChild(header);
  
  // Content
  if (config.content) {
    sheet.appendChild(config.content);
  }
  
  overlay.appendChild(sheet);
  document.body.appendChild(overlay);
  
  // Show with animation
  requestAnimationFrame(() => {
    overlay.classList.add('visible');
    sheet.classList.add('visible');
  });
  
  // Close handlers
  const close = () => {
    overlay.classList.remove('visible');
    sheet.classList.add('closing');
    setTimeout(() => overlay.remove(), 200);
  };
  
  // Close on overlay click
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  
  // Close on escape key
  const escapeHandler = (e) => {
    if (e.key === 'Escape') {
      close();
      document.removeEventListener('keydown', escapeHandler);
    }
  };
  document.addEventListener('keydown', escapeHandler);
  
  // Drag to close functionality
  let startY = 0;
  let currentY = 0;
  let isDragging = false;
  
  const handleStart = (e) => {
    const touch = e.touches ? e.touches[0] : e;
    startY = touch.clientY;
    isDragging = true;
    sheet.style.transition = 'none';
  };
  
  const handleMove = (e) => {
    if (!isDragging) return;
    e.preventDefault();
    
    const touch = e.touches ? e.touches[0] : e;
    currentY = touch.clientY - startY;
    
    if (currentY > 0) {
      sheet.style.transform = `translateY(${currentY}px)`;
      overlay.style.opacity = Math.max(0.3, 1 - currentY / 400);
    }
  };
  
  const handleEnd = () => {
    if (!isDragging) return;
    isDragging = false;
    
    sheet.style.transition = '';
    
    if (currentY > 150) {
      close();
    } else {
      sheet.style.transform = '';
      overlay.style.opacity = '';
    }
    
    currentY = 0;
  };
  
  // Touch events
  handle.addEventListener('touchstart', handleStart, { passive: false });
  document.addEventListener('touchmove', handleMove, { passive: false });
  document.addEventListener('touchend', handleEnd);
  
  // Mouse events for desktop
  handle.addEventListener('mousedown', handleStart);
  document.addEventListener('mousemove', handleMove);
  document.addEventListener('mouseup', handleEnd);
  
  return { overlay, sheet, close };
}

// Video generation modal
function showVideoGenModal() {
  const content = document.createElement('div');
  
  // Prompt input
  const promptRow = document.createElement('div');
  promptRow.className = 'bottom-sheet-row';
  const promptLabel = document.createElement('label');
  promptLabel.className = 'bottom-sheet-label';
  promptLabel.textContent = 'Video Prompt';
  const promptInput = document.createElement('textarea');
  promptInput.className = 'bottom-sheet-input';
  promptInput.placeholder = 'Describe the video you want to create...';
  promptInput.rows = 3;
  promptRow.appendChild(promptLabel);
  promptRow.appendChild(promptInput);
  content.appendChild(promptRow);
  
  // Model selection
  const modelRow = document.createElement('div');
  modelRow.className = 'bottom-sheet-row';
  const modelLabel = document.createElement('label');
  modelLabel.className = 'bottom-sheet-label';
  modelLabel.textContent = 'AI Model';
  const modelSelector = document.createElement('div');
  modelSelector.className = 'option-selector';
  
  const models = [
    { id: 'kling', name: 'Kling' },
    { id: 'luma', name: 'Luma' },
    { id: 'runway', name: 'Runway' }
  ];
  
  let selectedModel = 'kling';
  
  models.forEach(model => {
    const pill = document.createElement('button');
    pill.className = `option-pill ${model.id === selectedModel ? 'selected' : ''}`;
    pill.textContent = model.name;
    pill.onclick = () => {
      selectedModel = model.id;
      modelSelector.querySelectorAll('.option-pill').forEach(p => p.classList.remove('selected'));
      pill.classList.add('selected');
    };
    modelSelector.appendChild(pill);
  });
  
  modelRow.appendChild(modelLabel);
  modelRow.appendChild(modelSelector);
  content.appendChild(modelRow);
  
  // Duration selection (only for Kling)
  const durationRow = document.createElement('div');
  durationRow.className = 'bottom-sheet-row';
  const durationLabel = document.createElement('label');
  durationLabel.className = 'bottom-sheet-label';
  durationLabel.textContent = 'Duration';
  const durationSelector = document.createElement('div');
  durationSelector.className = 'option-selector';
  
  const durations = [
    { id: '5', name: '5 sec' },
    { id: '10', name: '10 sec' }
  ];
  
  let selectedDuration = '5';
  
  durations.forEach(duration => {
    const pill = document.createElement('button');
    pill.className = `option-pill ${duration.id === selectedDuration ? 'selected' : ''}`;
    pill.textContent = duration.name;
    pill.onclick = () => {
      selectedDuration = duration.id;
      durationSelector.querySelectorAll('.option-pill').forEach(p => p.classList.remove('selected'));
      pill.classList.add('selected');
    };
    durationSelector.appendChild(pill);
  });
  
  durationRow.appendChild(durationLabel);
  durationRow.appendChild(durationSelector);
  content.appendChild(durationRow);
  
  // Image upload (optional)
  const imageRow = document.createElement('div');
  imageRow.className = 'bottom-sheet-row';
  const imageLabel = document.createElement('label');
  imageLabel.className = 'bottom-sheet-label';
  imageLabel.textContent = 'Reference Image (Optional)';
  
  const imageUploadArea = document.createElement('div');
  imageUploadArea.className = 'image-upload-area';
  imageUploadArea.innerHTML = `
    <div class="upload-icon">
      <svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5" fill="none">
        <path d="M12 4v16m8-8H4"/>
      </svg>
    </div>
    <div class="upload-text">Tap to add image</div>
    <div class="upload-hint">JPG, PNG up to 10MB</div>
  `;
  
  const imageInput = document.createElement('input');
  imageInput.type = 'file';
  imageInput.accept = 'image/*';
  imageInput.style.display = 'none';
  
  let selectedImage = null;
  
  imageInput.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    if (file.size > 10 * 1024 * 1024) {
      toast('Image too large (max 10MB)', true);
      return;
    }
    
    selectedImage = file;
    
    // Show preview
    const reader = new FileReader();
    reader.onload = (e) => {
      imageUploadArea.className = 'image-upload-area has-image';
      imageUploadArea.innerHTML = `
        <div class="image-preview-container">
          <img src="${e.target.result}" alt="Preview" class="image-preview-thumb">
          <div class="image-preview-info">
            <div class="image-preview-name">${file.name}</div>
            <div class="image-preview-size">${(file.size / 1024 / 1024).toFixed(1)} MB</div>
          </div>
          <button class="image-remove-btn" type="button">
            <svg viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>
      `;
      
      // Remove image handler
      imageUploadArea.querySelector('.image-remove-btn').onclick = (e) => {
        e.stopPropagation();
        selectedImage = null;
        imageUploadArea.className = 'image-upload-area';
        imageUploadArea.innerHTML = `
          <div class="upload-icon">
            <svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5" fill="none">
              <path d="M12 4v16m8-8H4"/>
            </svg>
          </div>
          <div class="upload-text">Tap to add image</div>
          <div class="upload-hint">JPG, PNG up to 10MB</div>
        `;
      };
    };
    reader.readAsDataURL(file);
  };
  
  imageUploadArea.onclick = () => imageInput.click();
  
  imageRow.appendChild(imageLabel);
  imageRow.appendChild(imageUploadArea);
  content.appendChild(imageRow);
  
  // Submit button
  const submitBtn = document.createElement('button');
  submitBtn.className = 'bottom-sheet-submit';
  submitBtn.textContent = 'Generate Video';
  submitBtn.onclick = async () => {
    const prompt = promptInput.value.trim();
    if (!prompt) {
      promptInput.classList.add('error');
      setTimeout(() => promptInput.classList.remove('error'), 300);
      return;
    }
    
    submitBtn.disabled = true;
    submitBtn.textContent = 'Generating...';
    
    try {
      const formData = new FormData();
      formData.append('prompt', prompt);
      formData.append('model', selectedModel);
      if (selectedModel === 'kling') {
        formData.append('duration', selectedDuration);
      }
      if (selectedImage) {
        formData.append('image', selectedImage);
      }
      
      const res = await fetch('/api/video/generate', {
        method: 'POST',
        body: formData
      });
      
      if (!res.ok) throw new Error('Generation failed');
      
      const data = await res.json();
      
      // Close modal
      document.querySelector('.bottom-sheet-overlay').click();
      
      // Show success message
      toast('Video generation started! You\'ll be notified when ready.');
      
    } catch (e) {
      console.error('Video generation error:', e);
      toast('Failed to generate video', true);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Generate Video';
    }
  };
  
  content.appendChild(submitBtn);
  
  showBottomSheet({
    icon: '🎬',
    title: 'Generate Video',
    subtitle: 'Create AI-generated video from text prompts',
    content
  });
}

// ============================================================================
// KEYBOARD HANDLING
// ============================================================================

// Track keyboard state for mobile
let keyboardOpen = false;

function handleKeyboard() {
  const initialHeight = window.innerHeight;
  
  window.addEventListener('resize', () => {
    const currentHeight = window.innerHeight;
    const heightDiff = initialHeight - currentHeight;
    
    // Keyboard is considered open if height decreased by more than 150px
    const newKeyboardState = heightDiff > 150;
    
    if (newKeyboardState !== keyboardOpen) {
      keyboardOpen = newKeyboardState;
      document.body.classList.toggle('keyboard-open', keyboardOpen);
      
      // Adjust UI when keyboard opens/closes
      if (keyboardOpen) {
        // Keyboard opened - scroll to bottom to keep input visible
        setTimeout(() => scrollToBottomIfNeeded(), 100);
      }
    }
  });
}

handleKeyboard();

// ============================================================================
// PAGE LIFECYCLE
// ============================================================================

// Handle page visibility changes
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    // Page hidden - conserve resources
    if (mode === 'voice' && isListening) {
      console.log('👁️ Page hidden, pausing voice...');
      // Don't fully stop voice, just pause audio processing
    }
  } else {
    // Page visible again
    if (mode === 'voice' && isListening) {
      console.log('👁️ Page visible, resuming voice...');
    }
    
    // Reconnect WebSocket if disconnected
    if (!ws || ws.readyState === WebSocket.CLOSED) {
      connect();
    }
  }
});

// Handle page unload
window.addEventListener('beforeunload', () => {
  // Clean up resources
  if (isListening) {
    stopVoice();
  }
  releaseMicrophone();
  if (ws) {
    ws.close();
  }
});

// ============================================================================
// INITIALIZATION
// ============================================================================

// Start with intro page
showIntroPage();

console.log('✨ Spark Voice initialized');
