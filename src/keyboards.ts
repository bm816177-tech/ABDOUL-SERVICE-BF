import { CONFIG } from './config';
import { HostedProject } from './types';

export interface InlineBtn {
  text: string;
  url?: string;
  callback_data?: string;
}

export function buildForceJoinKeyboard() {
  const rows: InlineBtn[][] = CONFIG.requiredChats.map((ch) => [
    { text: `➕ Rejoindre ${ch.label}`, url: ch.url },
  ]);
  rows.push([{ text: '✅ J’ai rejoint — Vérifier', callback_data: 'verify_join' }]);
  rows.push([{ text: `👤 Contacter @${CONFIG.ownerUsername}`, url: `https://t.me/${CONFIG.ownerUsername}` }]);
  return rows;
}

export function buildMainMenuKeyboard(isAdmin = false) {
  const rows: InlineBtn[][] = [
    [
      { text: '📂 Mes projets', callback_data: 'menu_projects' },
      { text: '➕ Nouveau projet', callback_data: 'menu_newproject' },
    ],
    [
      { text: '🖥️ Terminal Termux', callback_data: 'open_term' },
      { text: '⚙️ Modifier mon Bot', callback_data: 'menu_editbot' },
    ],
    [
      { text: '📱 Numéros Virtuels', callback_data: 'quick_vnum' },
      { text: '⚡ Générateurs', callback_data: 'menu_gen' },
    ],
    [
      { text: '🧪 Lab & Cyber', callback_data: 'menu_lab' },
      { text: '🏢 Fournisseurs', callback_data: 'menu_providers' },
    ],
    [
      { text: '🖥️ Machines', callback_data: 'menu_machines' },
      { text: '📜 Toutes les commandes', callback_data: 'menu_help' },
    ],
  ];

  if (isAdmin) {
    rows.push([
      { text: '⭐ Retirer Étoiles (/withdraw)', callback_data: 'admin_withdraw' },
      { text: '👑 Liste Premium', callback_data: 'admin_premiums' },
    ]);
  }

  rows.push([
    { text: `👑 Propriétaire (@${CONFIG.ownerUsername})`, url: `https://t.me/${CONFIG.ownerUsername}` },
  ]);

  return rows;
}

export function buildNewProjectTypeKeyboard() {
  return [
    [
      { text: '🤖 Bot Telegram (TG)', callback_data: 'np_kind_tg' },
      { text: '💬 Bot WhatsApp (WHA)', callback_data: 'np_kind_wha' },
    ],
    [
      { text: '🌐 Site Web', callback_data: 'np_kind_web' },
      { text: '⚡ API Serverless', callback_data: 'np_kind_api' },
    ],
    [
      { text: '🖥️ Mini-App', callback_data: 'np_kind_webapp' },
      { text: '🧠 Générer par IA', callback_data: 'np_kind_ai' },
    ],
    [{ text: '⬅️ Retour Menu', callback_data: 'back_main' }],
  ];
}

export function buildProjectsListKeyboard(projects: HostedProject[]) {
  const rows: InlineBtn[][] = projects.slice(0, 8).map((p) => [
    { text: `🔧 Gérer : ${p.name}`, callback_data: `proj_manage_${p.id}` },
  ]);
  rows.push([
    { text: '➕ Nouveau projet', callback_data: 'menu_newproject' },
    { text: '⬅️ Retour Menu', callback_data: 'back_main' },
  ]);
  return rows;
}

export function buildProjectManageKeyboard(project: HostedProject) {
  const rows: InlineBtn[][] = [
    [
      { text: '🚀 Déployer / Redéployer 24/7', callback_data: `proj_deploy_${project.id}` },
      { text: '📜 Logs', callback_data: `proj_logs_${project.id}` },
    ],
    [
      { text: '🔑 Ajouter Variable (.env)', callback_data: `proj_env_${project.id}` },
      { text: '🗑️ Supprimer', callback_data: `proj_del_${project.id}` },
    ],
  ];
  if (project.url) {
    rows.unshift([{ text: '🌍 Ouvrir le projet en ligne', url: project.url }]);
  }
  rows.push([{ text: '⬅️ Mes projets', callback_data: 'menu_projects' }]);
  return rows;
}

export function buildEditBotKeyboard() {
  return [
    [
      { text: '📛 Nom du Bot', callback_data: 'editbot_name' },
      { text: '📝 Description', callback_data: 'editbot_desc' },
    ],
    [
      { text: 'ℹ️ À propos', callback_data: 'editbot_short' },
      { text: '🖼️ Photo (Avatar)', callback_data: 'editbot_photo' },
    ],
    [{ text: '📋 Synchroniser Commandes', callback_data: 'editbot_cmds' }],
    [{ text: '⬅️ Retour Menu', callback_data: 'back_main' }],
  ];
}

export function buildTerminalKeyboard() {
  return [
    [
      { text: 'ls -la', callback_data: 'term_cmd_ls -la' },
      { text: 'pwd', callback_data: 'term_cmd_pwd' },
      { text: 'neofetch', callback_data: 'term_cmd_neofetch' },
    ],
    [
      { text: 'kali root', callback_data: 'term_cmd_proot-distro login kali' },
      { text: 'clear', callback_data: 'term_cmd_clear' },
      { text: 'exit', callback_data: 'term_cmd_exit' },
    ],
    [{ text: '⬅️ Menu Principal', callback_data: 'back_main' }],
  ];
}
