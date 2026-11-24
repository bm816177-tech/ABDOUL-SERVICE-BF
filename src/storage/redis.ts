import { CONFIG } from '../config';
import { BotStats, TerminalSession, UserState } from '../types';

const memoryStore = new Map<string, string>();

async function redisCmd(command: (string | number)[]): Promise<unknown> {
  if (!CONFIG.redisUrl || !CONFIG.redisToken) {
    const key = String(command[1] || '');
    const op = String(command[0] || '').toUpperCase();
    if (op === 'GET') {
      return memoryStore.get(key) ?? null;
    }
    if (op === 'SET') {
      memoryStore.set(key, String(command[2] ?? ''));
      return 'OK';
    }
    return null;
  }

  const res = await fetch(`${CONFIG.redisUrl}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${CONFIG.redisToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(command),
  });

  if (!res.ok) {
    throw new Error(`Redis error: ${res.status}`);
  }
  const json = await res.json();
  return json.result;
}

export function createDefaultTerminal(): TerminalSession {
  return {
    active: false,
    distro: 'termux',
    cwd: '/home/dev/lab',
    mode: 'shell',
    env: {
      USER: 'dev',
      HOME: '/home/dev',
      SHELL: '/data/data/com.termux/files/usr/bin/bash',
      TARGET: '10.10.14.10',
    },
    aliases: {
      ll: 'ls -la',
      cls: 'clear',
      scan: 'nmap -sC -sV',
    },
    installedPkgs: ['bash', 'coreutils', 'curl', 'git', 'python', 'jq', 'openssl'],
    history: [],
    lastOutput: '',
    vfs: {
      '/home/dev/lab/readme.txt': {
        content: 'Bienvenue sur OmniCyber Termux Lab 24/7.\nTape "help" ou une commande Linux/Termux.',
        executable: false,
      },
      '/home/dev/lab/recon.sh': {
        content: '#!/bin/bash\necho "[*] Scan rapide sur $TARGET"\nnmap -sV -p 22,80,443 $TARGET',
        executable: true,
      },
      '/home/dev/lab/notes.md': {
        content: '# Notes Lab\n- Tester les ports ouverts\n- Vérifier les en-têtes HTTP\n- Documenter les trouvailles',
        executable: false,
      },
    },
  };
}

export async function getUserState(
  userId: number,
  meta?: { username?: string; firstName?: string }
): Promise<UserState> {
  const key = `omnici:user:${userId}`;
  const raw = (await redisCmd(['GET', key])) as string | null;

  let state: UserState;
  if (raw) {
    state = JSON.parse(raw) as UserState;
    if (!state.terminal) state.terminal = createDefaultTerminal();
    if (!state.projects) state.projects = [];
    if (!state.notes) state.notes = [];
    if (!state.machines) state.machines = [];
  } else {
    state = {
      userId,
      username: meta?.username,
      firstName: meta?.firstName,
      isPremium: userId === CONFIG.adminId,
      usageCount: 0,
      restorationCount: 0,
      cooldownUntil: 0,
      terminal: createDefaultTerminal(),
      projects: [],
      notes: [],
      machines: [
        {
          name: 'cyberbox-01',
          os: 'Linux (Ubuntu 24.04)',
          target: '10.10.14.10',
          notes: 'Serveur web + SSH exposé sur ports 22, 80, 8080.',
          hint: 'Commence par inspecter les en-têtes HTTP sur le port 8080.',
        },
      ],
    };
  }

  if (meta?.username) state.username = meta.username;
  if (meta?.firstName) state.firstName = meta.firstName;
  if (userId === CONFIG.adminId) state.isPremium = true;

  await saveUserState(state);
  return state;
}

export async function saveUserState(state: UserState): Promise<void> {
  const key = `omnici:user:${state.userId}`;
  await redisCmd(['SET', key, JSON.stringify(state)]);
}

export async function getBotStats(): Promise<BotStats> {
  const key = 'omnici:stats';
  const raw = (await redisCmd(['GET', key])) as string | null;
  if (!raw) {
    return {
      totalStarsEarned: 0,
      totalStarsWithdrawn: 0,
      premiumUserIds: [CONFIG.adminId],
      premiumUsernames: CONFIG.ownerUsername ? [CONFIG.ownerUsername.toLowerCase()] : [],
      knownUsers: {},
    };
  }
  const parsed = JSON.parse(raw) as BotStats;
  if (!parsed.premiumUserIds.includes(CONFIG.adminId)) {
    parsed.premiumUserIds.push(CONFIG.adminId);
  }
  return parsed;
}

export async function saveBotStats(stats: BotStats): Promise<void> {
  await redisCmd(['SET', 'omnici:stats', JSON.stringify(stats)]);
}
