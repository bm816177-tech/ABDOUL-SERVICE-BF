import { TerminalSession } from '../types';

export function renderTermuxScreen(
  session: TerminalSession,
  command: string,
  output: string,
  exitCode = 0
): string {
  const header =
    session.distro === 'kali'
      ? '🔴 KALI-PROOT // TTY1'
      : session.distro === 'ubuntu'
      ? '🟠 UBUNTU-PROOT // TTY1'
      : '🟢 TERMUX // aarch64-linux';

  const promptUser =
    session.distro === 'kali' ? 'root@kali' : `${session.env.USER || 'dev'}@termux`;
  const symbol = session.distro === 'kali' ? '#' : '$';
  const status = exitCode === 0 ? `✔ ${exitCode}` : `✘ ${exitCode}`;
  const shortCwd = session.cwd.replace('/home/dev', '~');

  const lines = output
    .split('\n')
    .slice(-26)
    .map((l) => `│ ${l.slice(0, 42)}`);

  const box = [
    '┌────────────────────────────────────────────┐',
    `│ ${header.padEnd(42, ' ')} │`,
    '├────────────────────────────────────────────┤',
    `│ ╭─[${promptUser}]─[${shortCwd}]`,
    `│ ╰─${symbol} ${command.slice(0, 38)}`,
    '│',
    ...lines,
    '│',
    `│ [${status}] │ pkg:${session.installedPkgs.length} │ mode:${session.mode}`,
    '└────────────────────────────────────────────┘',
  ].join('\n');

  return '```bash\n' + box + '\n```';
}
