export type ProjectKind = 'tg' | 'wha' | 'web' | 'api' | 'webapp' | 'ai';

export interface HostedProject {
  id: string;
  name: string;
  kind: ProjectKind;
  status: 'online_24_7' | 'draft';
  url?: string;
  botToken?: string;
  whaToken?: string;
  whaVerifyToken?: string;
  files: Record<string, string>;
  env: Record<string, string>;
  logs: string[];
  createdAt: string;
  updatedAt: string;
}

export interface VirtualFile {
  content: string;
  executable: boolean;
}

export interface TerminalSession {
  active: boolean;
  distro: 'termux' | 'kali' | 'ubuntu';
  cwd: string;
  mode: 'shell' | 'nano' | 'python' | 'msf';
  editingFile?: string;
  env: Record<string, string>;
  aliases: Record<string, string>;
  installedPkgs: string[];
  history: string[];
  lastOutput: string;
  vfs: Record<string, VirtualFile>;
}

export interface UserState {
  userId: number;
  username?: string;
  firstName?: string;
  isPremium: boolean;
  usageCount: number;
  restorationCount: number; // Augmente après chaque restauration -> fait croître l'attente
  cooldownUntil: number;  // Timestamp ms
  pendingAction?:
    | { type: 'new_project_name'; kind: ProjectKind }
    | { type: 'new_project_prompt'; name: string; kind: ProjectKind }
    | { type: 'new_project_token'; name: string; kind: ProjectKind }
    | { type: 'edit_bot_field'; field: 'name' | 'description' | 'shortDescription' | 'photo'; targetToken?: string }
    | { type: 'set_project_env'; projectId: string }
    | { type: 'add_machine' }
    | { type: 'save_note' };
  targetBotToken?: string;
  terminal: TerminalSession;
  projects: HostedProject[];
  notes: { id: string; text: string; tag: string; createdAt: string }[];
  machines: { name: string; os: string; target: string; notes: string; hint: string }[];
}

export interface BotStats {
  totalStarsEarned: number;
  totalStarsWithdrawn: number;
  premiumUserIds: number[];
  premiumUsernames: string[];
  knownUsers: Record<string, { userId: number; username?: string; firstName?: string }>;
}
