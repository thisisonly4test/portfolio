/**
 * Script de l'intro : messages du noyau puis de systemd.
 * Fonctions pures et déterministes (graine fixe) pour pouvoir les tester.
 */

export type BootLineKind = 'kernel' | 'ok' | 'wait' | 'welcome' | 'blank';

export interface BootLine {
  kind: BootLineKind;
  text: string;
  /** Pause avant d'afficher la ligne, en millisecondes (à vitesse 1). */
  delay: number;
  /** Pour `wait` : durée de l'animation [ *** ] avant de passer à OK. */
  hold?: number;
  /** Pour `wait` : texte affiché une fois le travail terminé. */
  doneText?: string;
}

/** Générateur pseudo-aléatoire mulberry32 : même graine, même démarrage. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Horodatage façon dmesg : `[    1.234567]`. */
export function stamp(seconds: number): string {
  return `[${seconds.toFixed(6).padStart(12)}]`;
}

const KERNEL_MESSAGES = [
  'Linux version 6.12.0-amd64 (debian-kernel@lists.debian.org) (gcc-14 (Debian 14.2.0) 14.2.0) #1 SMP PREEMPT_DYNAMIC Debian 6.12.38-1',
  'Command line: BOOT_IMAGE=/boot/vmlinuz-6.12.0-amd64 root=UUID=7f3c2a91-4e0b-4c55-9d1e-2b8f6a0c1d42 ro quiet lockdown=integrity',
  'BIOS-provided physical RAM map:',
  'BIOS-e820: [mem 0x0000000000100000-0x00000003ffffffff] usable',
  'NX (Execute Disable) protection: active',
  'Secure boot enabled',
  'Kernel is locked down from EFI Secure Boot mode; see man kernel_lockdown.7',
  'smp: Brought up 1 node, 8 CPUs',
  'Memory: 16248712K/16777216K available',
  'LSM: initializing lsm=lockdown,capability,landlock,yama,apparmor',
  'AppArmor: AppArmor initialized',
  'Run /init as init process',
  'EXT4-fs (nvme0n1p2): mounted filesystem with ordered data mode. Quota mode: none.',
  'random: crng init done',
  'e1000e 0000:00:1f.6 eno1: NIC Link is Up 1000 Mbps Full Duplex',
  'audit: type=1403 audit(1760134562.112:2): auid=4294967295 ses=4294967295 lsm=apparmor res=1',
];

interface Unit {
  text: string;
  wait?: { label: string; hold: number };
}

const SYSTEMD_UNITS: Unit[] = [
  { text: 'Started <b>systemd-journald.service</b> - Journal Service.' },
  { text: 'Started <b>auditd.service</b> - Security Auditing Service.' },
  { text: 'Started <b>nftables.service</b> - nftables.' },
  { text: 'Reached target <b>network-pre.target</b> - Preparation for Network.' },
  { text: 'Started <b>systemd-networkd.service</b> - Network Configuration.' },
  {
    text: 'Started <b>wg-quick@wg0.service</b> - WireGuard via wg-quick(8) for wg0.',
    wait: { label: 'A start job is running for WireGuard via wg-quick(8) for wg0', hold: 900 },
  },
  { text: 'Started <b>chrony.service</b> - chrony, an NTP client/server.' },
  { text: 'Started <b>ssh.service</b> - OpenBSD Secure Shell server.' },
  { text: 'Started <b>fail2ban.service</b> - Fail2Ban Service.' },
  { text: 'Started <b>suricata.service</b> - Suricata IDS/IDP daemon.' },
  { text: 'Reached target <b>multi-user.target</b> - Multi-User System.' },
  { text: 'Started <b>portfolio.service</b> - aurele — portfolio.' },
];

export function kernelLines(seed = 42): BootLine[] {
  const rand = rng(seed);
  let t = 0;
  return KERNEL_MESSAGES.map((msg, i) => {
    t += i === 0 ? 0 : 0.003 + rand() * (i > 10 ? 0.3 : 0.05);
    return { kind: 'kernel', text: `${stamp(t)} ${msg}`, delay: 14 + Math.round(rand() * 40) };
  });
}

export function systemdLines(seed = 7): BootLine[] {
  const rand = rng(seed);
  const lines: BootLine[] = [
    { kind: 'blank', text: '', delay: 90 },
    { kind: 'welcome', text: 'Welcome to <b>Debian GNU/Linux 13 (trixie)</b>!', delay: 120 },
    { kind: 'blank', text: '', delay: 40 },
  ];
  for (const unit of SYSTEMD_UNITS) {
    const delay = 35 + Math.round(rand() * 85);
    if (unit.wait) lines.push({ kind: 'wait', text: unit.wait.label, delay, hold: unit.wait.hold, doneText: unit.text });
    else lines.push({ kind: 'ok', text: unit.text, delay });
  }
  return lines;
}

/** Toutes les lignes de l'intro, dans l'ordre. */
export function bootScript(seed = 42): BootLine[] {
  return [...kernelLines(seed), ...systemdLines(seed + 1)];
}

/** Durée totale du script à vitesse 1, en millisecondes. */
export function scriptDuration(lines: BootLine[]): number {
  return lines.reduce((sum, l) => sum + l.delay + (l.hold ?? 0), 0);
}

/** Cadre animé de l'attente systemd : `[ *** ]` qui va et vient. */
export function spinnerFrame(step: number): string {
  const width = 6;
  const cycle = width * 2 - 2;
  const pos = step % cycle;
  const head = pos < width ? pos : cycle - pos;
  let out = '';
  for (let i = 0; i < width; i++) {
    const d = Math.abs(i - head);
    out += d === 0 ? '<span class="s3">*</span>' : d === 1 ? '<span class="s2">*</span>' : d === 2 ? '<span class="s1">*</span>' : ' ';
  }
  return out;
}
