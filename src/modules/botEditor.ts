import { CONFIG } from '../config';

export async function updateBotName(token: string, name: string): Promise<string> {
  const res = await fetch(`https://api.telegram.org/bot${token}/setMyName`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  const d = await res.json();
  return d.ok ? `✅ Nom du bot mis à jour : *${name}*` : `❌ Erreur : ${d.description}`;
}

export async function updateBotDescription(token: string, description: string): Promise<string> {
  const res = await fetch(`https://api.telegram.org/bot${token}/setMyDescription`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ description }),
  });
  const d = await res.json();
  return d.ok ? `✅ Description du bot mise à jour.` : `❌ Erreur : ${d.description}`;
}

export async function updateBotShortDescription(token: string, shortDescription: string): Promise<string> {
  const res = await fetch(`https://api.telegram.org/bot${token}/setMyShortDescription`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ short_description: shortDescription }),
  });
  const d = await res.json();
  return d.ok ? `✅ Texte "À propos" mis à jour.` : `❌ Erreur : ${d.description}`;
}

export async function syncDefaultBotCommands(token: string): Promise<string> {
  const commands = [
    { command: 'start', description: 'Menu principal & accès' },
    { command: 'term', description: 'Ouvrir le terminal Termux / Linux' },
    { command: 'projects', description: 'Mes projets hébergés 24/7' },
    { command: 'newproject', description: 'Créer un nouveau projet' },
    { command: 'editbot', description: 'Modifier nom, desc, photo du bot' },
    { command: 'vnum', description: 'Générateur de numéros virtuels' },
    { command: 'help', description: 'Toutes les commandes' },
  ];

  const res = await fetch(`https://api.telegram.org/bot${token}/setMyCommands`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ commands }),
  });
  const d = await res.json();
  return d.ok ? '✅ Commandes du bot synchronisées.' : `❌ Erreur : ${d.description}`;
}

export function getActiveEditableToken(customToken?: string): string {
  return customToken && customToken.trim().length > 10 ? customToken.trim() : CONFIG.botToken;
}
