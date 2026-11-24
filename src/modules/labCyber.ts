import crypto from 'crypto';
import { askOmniAI } from '../ai/openrouter';

const COUNTRY_PREFIXES: Record<string, { code: string; name: string; len: number }> = {
  fr: { code: '+33', name: 'France', len: 9 },
  us: { code: '+1', name: 'États-Unis', len: 10 },
  uk: { code: '+44', name: 'Royaume-Uni', len: 10 },
  ci: { code: '+225', name: "Côte d'Ivoire", len: 10 },
  de: { code: '+49', name: 'Allemagne', len: 10 },
  ca: { code: '+1', name: 'Canada', len: 10 },
};

export function generateVirtualNumbers(countryArg?: string, count = 3): string {
  const key = (countryArg || 'us').toLowerCase();
  const info = COUNTRY_PREFIXES[key] || COUNTRY_PREFIXES.us;
  const safeCount = Math.min(Math.max(count, 1), 6);
  const lines: string[] = [
    `📱 *GÉNÉRATEUR DE NUMÉROS VIRTUELS* (${info.name} ${info.code})`,
    '',
  ];

  for (let i = 0; i < safeCount; i++) {
    let digits = '';
    for (let d = 0; d < info.len; d++) {
      digits += crypto.randomInt(d === 0 ? 1 : 0, 10).toString();
    }
    const otp = crypto.randomInt(100000, 999999);
    lines.push(`${i + 1}. \`${info.code}${digits}\`  |  OTP test : \`${otp}\``);
  }

  lines.push(
    '',
    '💡 *Pays dispo :* `fr`, `us`, `uk`, `ci`, `de`, `ca` — Ex: `/vnum ci 4`'
  );
  return lines.join('\n');
}

export function generatePassword(length = 20): string {
  const len = Math.min(Math.max(length, 8), 64);
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*_-+=';
  let out = '';
  for (let i = 0; i < len; i++) {
    out += chars[crypto.randomInt(0, chars.length)];
  }
  return out;
}

export function generateUuid(): string {
  return crypto.randomUUID();
}

export function generateSecret(bytes = 32): string {
  const safeBytes = Math.min(Math.max(bytes, 8), 64);
  return crypto.randomBytes(safeBytes).toString('hex');
}

export function generateHashes(input: string): string {
  const md5 = crypto.createHash('md5').update(input).digest('hex');
  const sha1 = crypto.createHash('sha1').update(input).digest('hex');
  const sha256 = crypto.createHash('sha256').update(input).digest('hex');
  return [
    '🔐 *HASHES GÉNÉRÉS*',
    `• *MD5 :* \`${md5}\``,
    `• *SHA1 :* \`${sha1}\``,
    `• *SHA256 :* \`${sha256}\``,
  ].join('\n');
}

export async function handleLabOrCyberCommand(cmd: string, args: string): Promise<string> {
  switch (cmd) {
    case 'vnum': {
      const parts = args.trim().split(/\s+/).filter(Boolean);
      const ctry = parts[0] || 'us';
      const num = parts[1] ? Number(parts[1]) : 3;
      return generateVirtualNumbers(ctry, Number.isNaN(num) ? 3 : num);
    }
    case 'gen': {
      const [sub, ...rest] = args.trim().split(/\s+/);
      const val = rest.join(' ');
      if (sub === 'vnum') {
        const parts = val.split(/\s+/).filter(Boolean);
        return generateVirtualNumbers(parts[0] || 'us', Number(parts[1]) || 3);
      }
      if (sub === 'password' || sub === 'pass') {
        return `🔑 *Mot de passe :* \`${generatePassword(Number(val) || 20)}\``;
      }
      if (sub === 'uuid') {
        return `🆔 *UUID v4 :* \`${generateUuid()}\``;
      }
      if (sub === 'secret' || sub === 'token') {
        return `🛡️ *Secret Hex :* \`${generateSecret(Number(val) || 32)}\``;
      }
      if (sub === 'b64') {
        return `📦 *Base64 :* \`${Buffer.from(val || 'omnici').toString('base64')}\``;
      }
      return askOmniAI(`Génère proprement pour "${cmd} ${args}" (cron, docker, gitignore, payload ou config).`);
    }
    case 'hash':
      return generateHashes(args || 'omnici');
    case 'b64': {
      const [mode, ...rest] = args.trim().split(/\s+/);
      const text = rest.join(' ');
      if (mode === 'decode' || mode === '-d') {
        return `🔓 *Décodé :* \`${Buffer.from(text, 'base64').toString('utf-8')}\``;
      }
      const source = mode === 'encode' ? text : `${mode || ''} ${text}`.trim();
      return `🔒 *Encodé Base64 :* \`${Buffer.from(source).toString('base64')}\``;
    }
    default:
      return askOmniAI(
        `Tu es le module Lab & Cyber-cyvoron d'OmniCyber. Traite la commande \`/${cmd} ${args}\` de façon claire, technique et concise.`
      );
  }
  }
      
