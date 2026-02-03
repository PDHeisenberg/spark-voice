/**
 * Mode Sessions Manager
 * 
 * Handles separate persistent sessions for each Spark Voice mode:
 * - Dev Mode
 * - Research Mode
 * - Plan Mode
 * - Articulate Mode
 * - Daily Reports
 * - Video Gen
 * 
 * Each mode has its own isolated session that persists across interactions.
 * All modes except Articulate notify WhatsApp when tasks complete.
 */

import { execSync, spawn } from 'child_process';
import { existsSync, readFileSync } from 'fs';

const CLAWDBOT_PATH = '/home/heisenberg/.npm-global/bin/clawdbot';
const GATEWAY_URL = 'http://localhost:18789';
const HOOK_TOKEN = 'spark-portal-hook-token-2026';

// Mode configurations
export const MODE_CONFIG = {
  dev: {
    label: 'spark-dev-mode',
    name: 'Dev Mode',
    icon: '👨‍💻',
    notifyWhatsApp: true,
    systemPrompt: `You are a Dev Team coordinator running in an isolated Dev Mode session.

Your role: Implement code changes using an Engineer + QA collaborative workflow.

WORKSPACE: /home/heisenberg/clawd/spark-voice (unless user specifies otherwise)

WORKFLOW for each task:
1. Create backup branch: git checkout -b backup-[timestamp]
2. Break task into discrete items
3. For EACH item:
   - ENGINEER: Read files, implement fix, test syntax, commit
   - QA: Review for correctness, edge cases, regressions
   - If approved → next item
   - If rejected → fix and repeat

4. After ALL items approved, push to GitHub

RULES:
- One item at a time, sequential
- Engineer commits before QA reviews
- QA must explicitly APPROVE or REJECT

When ALL tasks complete, notify via WhatsApp:
Use message tool: action="send", target="+6587588470"
Message: "✅ Dev Mode complete! [Summary of changes]"

Start working on the user's request.`
  },
  
  research: {
    label: 'spark-research-mode',
    name: 'Research Mode',
    icon: '🔬',
    notifyWhatsApp: true,
    systemPrompt: `You are a Deep Research Analyst running in an isolated Research Mode session.

Your role: Conduct thorough multi-source research on topics the user asks about.

METHODOLOGY:
1. Break topic into key research questions
2. For each question:
   - Search multiple sources (web_search, web_fetch)
   - Cross-reference information
   - Note conflicting viewpoints
   - Track sources

3. Synthesize into structured report

OUTPUT: Save to memory/research-{topic}-{date}.md
Include:
- Executive summary
- Key findings
- Detailed analysis
- Sources cited
- Open questions

When research is complete, notify via WhatsApp:
Use message tool: action="send", target="+6587588470"
Message: "🔬 Research complete: [topic]

[2-3 sentence summary]

Full report: memory/research-{filename}.md"

Start researching what the user asks.`
  },
  
  plan: {
    label: 'spark-plan-mode',
    name: 'Plan Mode',
    icon: '📋',
    notifyWhatsApp: true,
    systemPrompt: `You are a Technical Planner running in an isolated Plan Mode session.

Your role: Create detailed technical specifications and implementation plans.

WORKFLOW:
1. Ask 2-3 clarifying questions (max)
2. Generate comprehensive spec including:
   - Problem statement
   - Proposed solution
   - Technical architecture
   - Implementation steps
   - Edge cases
   - Testing plan
   - Timeline estimate

3. Save to specs/{feature-name}.md

When spec is complete, notify via WhatsApp:
Use message tool: action="send", target="+6587588470"
Message: "📋 Plan complete: [feature]

[Brief summary]

Full spec: specs/{filename}.md"

Start planning what the user describes.`
  },
  
  articulate: {
    label: 'spark-articulate-mode',
    name: 'Articulate Mode',
    icon: '✍️',
    notifyWhatsApp: false, // No WhatsApp notification
    systemPrompt: `You are a Writing Refinement Tool running in Articulate Mode.

Your ONLY job: Rephrase text for clarity, grammar, and crispness.

CRITICAL RULES:
- If input is a question, OUTPUT THE SAME QUESTION with better grammar. DO NOT ANSWER IT.
- Keep rephrased text as close to original as possible
- Maintain original length, tone, and essence
- NO dashes, NO bold, NO text decorations
- Points only if input has points
- Sound human and natural
- Output ONLY the refined text - nothing else

You are NOT a chatbot. You ONLY output cleaner versions of input text.`
  },
  
  dailyreports: {
    label: 'spark-dailyreports-mode',
    name: 'Daily Reports',
    icon: '📊',
    notifyWhatsApp: true,
    systemPrompt: `You are a Daily Reports generator running in an isolated session.

Your role: Generate and manage daily briefings for Parth.

Available reports:
- Morning Briefing (portfolio + concept)
- Market Recap
- Science Update
- Geopolitics Update
- Pre-Market Briefing
- AI/Tech Evening

When generating a report, follow HEARTBEAT.md format guidelines.

Always notify via WhatsApp when a report is ready:
Use message tool: action="send", target="+6587588470"`
  },
  
  videogen: {
    label: 'spark-videogen-mode',
    name: 'Video Gen',
    icon: '🎬',
    notifyWhatsApp: true,
    systemPrompt: `You are a Video Generation assistant running in an isolated session.

Your role: Generate AI videos using the Kling model via Replicate.

CAPABILITIES:
- Text to Video: Generate video from text description
- Image to Video: Animate a static image
- Face Swap: Replace faces in videos

WORKFLOW:
1. Parse user request (workflow type, prompt, settings)
2. Use Replicate API with Kling model
3. Monitor generation progress
4. Return video URL when complete

When video is ready, notify via WhatsApp:
Use message tool: action="send", target="+6587588470"
Message: "🎬 Video ready! [link]"

Token location: ~/.config/clawdbot/secrets/replicate-token`
  }
};

/**
 * Send a message to a mode-specific session
 * Creates the session if it doesn't exist
 */
export async function sendToModeSession(mode, message, callbacks = {}) {
  const config = MODE_CONFIG[mode];
  if (!config) {
    throw new Error(`Unknown mode: ${mode}`);
  }
  
  const { onThinking, onText, onDone, onError } = callbacks;
  
  console.log(`📦 [${config.name}] Sending: ${message.slice(0, 50)}...`);
  
  if (onThinking) onThinking();
  
  return new Promise((resolve) => {
    const timeout = 10 * 60 * 1000; // 10 minutes for mode sessions
    let stdout = '';
    let stderr = '';
    let completed = false;
    
    // Use sessions_send via CLI to route to labeled session
    // If session doesn't exist, it will be created
    const proc = spawn(CLAWDBOT_PATH, [
      'sessions', 'send',
      '--label', config.label,
      '--message', message,
      '--timeout', '600', // 10 min
      '--json'
    ], {
      timeout,
      env: { ...process.env }
    });
    
    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    const timeoutId = setTimeout(() => {
      if (!completed) {
        completed = true;
        proc.kill('SIGTERM');
        const error = 'Mode session timeout after 10 minutes';
        console.error(`[${config.name}] ${error}`);
        if (onError) onError(error);
        if (onDone) onDone();
        resolve({ success: false, error });
      }
    }, timeout);
    
    proc.on('close', (code) => {
      clearTimeout(timeoutId);
      if (completed) return;
      completed = true;
      
      try {
        if (code !== 0) {
          // Check if session doesn't exist - need to create it
          if (stderr.includes('not found') || stderr.includes('no session')) {
            console.log(`[${config.name}] Session not found, creating...`);
            // Create session with spawn, then retry
            createModeSession(mode, config)
              .then(() => sendToModeSession(mode, message, callbacks))
              .then(resolve)
              .catch(err => {
                if (onError) onError(err.message);
                if (onDone) onDone();
                resolve({ success: false, error: err.message });
              });
            return;
          }
          
          throw new Error(`CLI exited with code ${code}: ${(stderr || stdout).slice(0, 300)}`);
        }
        
        // Parse response
        const result = JSON.parse(stdout);
        const reply = result.reply || result.response || result.text || 
                      'Task processed in mode session.';
        
        console.log(`✅ [${config.name}] Response: ${reply.slice(0, 100)}...`);
        
        if (onText) onText(reply);
        if (onDone) onDone();
        resolve({ success: true, reply });
        
      } catch (e) {
        console.error(`[${config.name}] Error:`, e.message);
        if (onError) onError(e.message);
        if (onDone) onDone();
        resolve({ success: false, error: e.message });
      }
    });
    
    proc.on('error', (e) => {
      clearTimeout(timeoutId);
      if (completed) return;
      completed = true;
      
      console.error(`[${config.name}] Spawn error:`, e.message);
      if (onError) onError(e.message);
      if (onDone) onDone();
      resolve({ success: false, error: e.message });
    });
  });
}

/**
 * Create a new mode session with the appropriate system prompt
 */
async function createModeSession(mode, config) {
  console.log(`🆕 Creating session for ${config.name}...`);
  
  return new Promise((resolve, reject) => {
    const proc = spawn(CLAWDBOT_PATH, [
      'sessions', 'spawn',
      '--label', config.label,
      '--task', config.systemPrompt,
      '--cleanup', 'keep', // Persistent
      '--json'
    ], {
      timeout: 30000
    });
    
    let stdout = '';
    let stderr = '';
    
    proc.stdout.on('data', d => stdout += d.toString());
    proc.stderr.on('data', d => stderr += d.toString());
    
    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Failed to create session: ${stderr || stdout}`));
      } else {
        console.log(`✅ Created ${config.name} session`);
        resolve();
      }
    });
    
    proc.on('error', reject);
  });
}

/**
 * Get history from a mode session
 */
export async function getModeSessionHistory(mode, limit = 50) {
  const config = MODE_CONFIG[mode];
  if (!config) return [];
  
  try {
    const output = execSync(`${CLAWDBOT_PATH} sessions history --label ${config.label} --limit ${limit} --json`, {
      encoding: 'utf8',
      timeout: 10000
    });
    
    const data = JSON.parse(output);
    return data.messages || [];
  } catch (e) {
    console.error(`Failed to get ${mode} history:`, e.message);
    return [];
  }
}

/**
 * Check if a mode session exists and is active
 */
export async function getModeSessionStatus(mode) {
  const config = MODE_CONFIG[mode];
  if (!config) return { exists: false };
  
  try {
    const output = execSync(`${CLAWDBOT_PATH} sessions list --json`, {
      encoding: 'utf8',
      timeout: 5000
    });
    
    const data = JSON.parse(output);
    const sessions = data.sessions || [];
    const session = sessions.find(s => s.label === config.label);
    
    return {
      exists: !!session,
      active: session?.updatedAt > Date.now() - 5 * 60 * 1000, // Active in last 5 min
      session
    };
  } catch (e) {
    return { exists: false, error: e.message };
  }
}

/**
 * Get all mode session statuses
 */
export async function getAllModeStatuses() {
  const statuses = {};
  
  for (const mode of Object.keys(MODE_CONFIG)) {
    statuses[mode] = await getModeSessionStatus(mode);
  }
  
  return statuses;
}
