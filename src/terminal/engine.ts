import { askOmniAI } from '../ai/openrouter';
import { TerminalSession, UserState } from '../types';
import { saveUserState } from '../storage/redis';
import { renderTermuxScreen } from './renderer';

function resolvePath(cwd: string, target: string): string {
  if (!target || target === '~') return '/home/dev/lab';
  const base = target.startsWith('/') ? target : `${cwd}/${target}`;
  const parts: string[] = [];
  for (const part of base.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') parts.pop();
    else parts.push(part);
  }
  return '/' + parts.join('/');
}

function applyEnvAndAliases(session: TerminalSession, input: string): string {
  let cmd = input.trim();
  for (const [k, v] of Object.entries(session.env)) {
    cmd = cmd.replace(new RegExp(`\\$${k}\\b`, 'g'), v);
  }
  const firstWord = cmd.split(/\s+/)[0];
  if (firstWord && session.aliases[firstWord]) {
    cmd = cmd.replace(new RegExp(`^${firstWord}\\b`), session.aliases[firstWord]);
  }
  return cmd;
}

export async function executeTerminalInput(
  user: UserState,
  rawInput: string
): Promise<{ text: string; exitTerminal?: boolean }> {
  const s: TerminalSession = user.terminal;

  // Mode éditeur nano interactif
  if (s.mode === 'nano' && s.editingFile) {
    if (rawInput.trim() === ':wq' || rawInput.trim() === '^X') {
      const savedPath = s.editingFile;
      s.mode = 'shell';
      s.editingFile = undefined;
      await saveUserState(user);
      const screen = renderTermuxScreen(s, `nano ${savedPath}`, `Fichier enregistré : ${savedPath}`, 0);
      return { text: screen };
    }
    const existing = s.vfs[s.editingFile]?.content || '';
    s.vfs[s.editingFile] = {
      content: existing ? `${existing}\n${rawInput}` : rawInput,
      executable: s.vfs[s.editingFile]?.executable || false,
    };
    await saveUserState(user);
    const preview = [
      `GNU nano // ${s.editingFile}`,
      '------------------------------',
      s.vfs[s.editingFile].content,
      '------------------------------',
      'Envoie une ligne pour ajouter, ou :wq pour sauvegarder.',
    ].join('\n');
    return { text: renderTermuxScreen(s, `edit ${s.editingFile}`, preview, 0) };
  }

  // Mode REPL python3 interactif
  if (s.mode === 'python') {
    if (rawInput.trim() === 'exit()' || rawInput.trim() === 'exit') {
      s.mode = 'shell';
      await saveUserState(user);
      return { text: renderTermuxScreen(s, 'exit()', 'Sortie du REPL Python.', 0) };
    }
    const aiOut = await askOmniAI(
      `Évalue cette ligne Python dans un REPL interactif et affiche uniquement la sortie : ${rawInput}`
    );
    return { text: renderTermuxScreen(s, `>>> ${rawInput}`, aiOut, 0) };
  }

  const cmd = applyEnvAndAliases(s, rawInput);
  if (!['history', 'clear'].includes(cmd.trim())) {
    s.history.push(cmd);
    if (s.history.length > 30) s.history.shift();
  }

  if (cmd === 'exit') {
    s.active = false;
    s.mode = 'shell';
    await saveUserState(user);
    return {
      text: renderTermuxScreen(s, 'exit', 'Session terminal mise en veille. Retour mode Omni.', 0),
      exitTerminal: true,
    };
  }

  if (cmd === 'clear') {
    s.lastOutput = '';
    await saveUserState(user);
    return { text: renderTermuxScreen(s, 'clear', '', 0) };
  }

  if (cmd === 'pwd') {
    await saveUserState(user);
    return { text: renderTermuxScreen(s, cmd, s.cwd, 0) };
  }

  if (cmd === 'whoami') {
    const out = s.distro === 'kali' ? 'root' : s.env.USER || 'dev';
    await saveUserState(user);
    return { text: renderTermuxScreen(s, cmd, out, 0) };
  }

  if (cmd === 'history') {
    const out = s.history.map((h, i) => `${i + 1}  ${h}`).join('\n') || '(vide)';
    await saveUserState(user);
    return { text: renderTermuxScreen(s, cmd, out, 0) };
  }

  if (cmd === 'neofetch' || cmd === 'termux-info') {
    const out = [
      `${s.env.USER || 'dev'}@${s.distro}`,
      '-----------------',
      `OS: ${s.distro === 'termux' ? 'Android aarch64 Termux' : `${s.distro} GNU/Linux`}`,
      `Host: Vercel Edge / OmniCyber 24/7`,
      `Shell: bash 5.2`,
      `Packages: ${s.installedPkgs.length} installés`,
      `Dir: ${s.cwd}`,
    ].join('\n');
    await saveUserState(user);
    return { text: renderTermuxScreen(s, cmd, out, 0) };
  }

  if (cmd.startsWith('cd')) {
    const arg = cmd.replace(/^cd\s*/, '').trim();
    s.cwd = resolvePath(s.cwd, arg);
    await saveUserState(user);
    return { text: renderTermuxScreen(s, cmd, '', 0) };
  }

  if (cmd === 'ls' || cmd.startsWith('ls ')) {
    const prefix = s.cwd.endsWith('/') ? s.cwd : `${s.cwd}/`;
    const entries = new Set<string>();
    for (const filePath of Object.keys(s.vfs)) {
      if (filePath.startsWith(prefix)) {
        const rest = filePath.slice(prefix.length);
        const firstSeg = rest.split('/')[0];
        if (firstSeg) {
          const isExec = s.vfs[filePath]?.executable;
          entries.add(isExec ? `${firstSeg}*` : firstSeg);
        }
      }
    }
    const out = Array.from(entries).join('   ') || '(dossier vide)';
    await saveUserState(user);
    return { text: renderTermuxScreen(s, cmd, out, 0) };
  }

  if (cmd.startsWith('cat ')) {
    const target = resolvePath(s.cwd, cmd.replace(/^cat\s+/, '').trim());
    const file = s.vfs[target];
    if (!file) {
      return { text: renderTermuxScreen(s, cmd, `cat: ${target}: Aucun fichier ou dossier`, 1) };
    }
    return { text: renderTermuxScreen(s, cmd, file.content, 0) };
  }

  if (cmd.startsWith('nano ')) {
    const target = resolvePath(s.cwd, cmd.replace(/^nano\s+/, '').trim());
    s.mode = 'nano';
    s.editingFile = target;
    if (!s.vfs[target]) {
      s.vfs[target] = { content: '', executable: false };
    }
    await saveUserState(user);
    return {
      text: renderTermuxScreen(
        s,
        cmd,
        `Ouverture de ${target}...\nContenu actuel :\n${s.vfs[target].content || '(vide)'}\n\nEnvoie ton texte ou :wq pour quitter.`,
        0
      ),
    };
  }

  if (cmd.startsWith('chmod +x ')) {
    const target = resolvePath(s.cwd, cmd.replace(/^chmod \+x\s+/, '').trim());
    if (!s.vfs[target]) {
      return { text: renderTermuxScreen(s, cmd, `chmod: ${target}: introuvable`, 1) };
    }
    s.vfs[target].executable = true;
    await saveUserState(user);
    return { text: renderTermuxScreen(s, cmd, `Permissions exécutables ajoutées à ${target}`, 0) };
  }

  if (cmd.startsWith('export ')) {
    const pair = cmd.replace(/^export\s+/, '').trim();
    const [k, ...rest] = pair.split('=');
    if (k && rest.length > 0) {
      s.env[k.trim()] = rest.join('=').replace(/^["']|["']$/g, '');
      await saveUserState(user);
      return { text: renderTermuxScreen(s, cmd, `Variable ${k.trim()} définie.`, 0) };
    }
  }

  if (cmd.startsWith('alias ')) {
    const pair = cmd.replace(/^alias\s+/, '').trim();
    const [k, ...rest] = pair.split('=');
    if (k && rest.length > 0) {
      s.aliases[k.trim()] = rest.join('=').replace(/^["']|["']$/g, '');
      await saveUserState(user);
      return { text: renderTermuxScreen(s, cmd, `Alias '${k.trim()}' enregistré.`, 0) };
    }
  }

  // Redirection simple echo "..." > fichier
  const redirectMatch = cmd.match(/^echo\s+(.+?)\s*(>>?)\s*(\S+)$/);
  if (redirectMatch) {
    const content = redirectMatch[1].replace(/^["']|["']$/g, '');
    const op = redirectMatch[2];
    const target = resolvePath(s.cwd, redirectMatch[3]);
    const prev = op === '>>' && s.vfs[target] ? `${s.vfs[target].content}\n` : '';
    s.vfs[target] = {
      content: `${prev}${content}`,
      executable: s.vfs[target]?.executable || false,
    };
    await saveUserState(user);
    return { text: renderTermuxScreen(s, cmd, `Écrit dans ${target}`, 0) };
  }

  // pkg install <paquet>
  if (cmd.startsWith('pkg install ')) {
    const pkgName = cmd.replace(/^pkg install\s+/, '').trim();
    if (pkgName && !s.installedPkgs.includes(pkgName)) {
      s.installedPkgs.push(pkgName);
    }
    await saveUserState(user);
    return {
      text: renderTermuxScreen(
        s,
        cmd,
        `Checking mirror... ok\nUnpacking ${pkgName} ...\nSetting up ${pkgName} ...\n[✔] ${pkgName} prêt.`,
        0
      ),
    };
  }

  // proot-distro login <kali|ubuntu>
  if (cmd.startsWith('proot-distro login ')) {
    const targetDistro = cmd.replace(/^proot-distro login\s+/, '').trim();
    if (targetDistro === 'kali' || targetDistro === 'ubuntu') {
      s.distro = targetDistro;
      s.cwd = targetDistro === 'kali' ? '/root' : '/home/ubuntu';
      await saveUserState(user);
      return { text: renderTermuxScreen(s, cmd, `Connexion à ${targetDistro} réussie.`, 0) };
    }
  }

  if (cmd === 'python3' || cmd === 'python') {
    s.mode = 'python';
    await saveUserState(user);
    return {
      text: renderTermuxScreen(s, cmd, 'Python 3.12 REPL actif. Tape exit() pour quitter.', 0),
    };
  }

  // Toute autre commande Linux/Termux, pipe, script ou question passe par l'IA dans l'écran Termux
  const aiResult = await askOmniAI(
    `Exécute ou simule de façon réaliste et concise cette commande/requête dans le terminal ${s.distro} (répertoire ${s.cwd}) : ${cmd}\nRéponds uniquement par la sortie terminal propre sans bavardage inutile.`,
    `Distro=${s.distro}; CWD=${s.cwd}; Env=${JSON.stringify(s.env)}; InstalledPkgs=${s.installedPkgs.join(',')}`
  );

  s.lastOutput = aiResult;
  await saveUserState(user);
  return { text: renderTermuxScreen(s, cmd, aiResult, 0) };
}
