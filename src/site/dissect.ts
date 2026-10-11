/**
 * Construit, octet par octet, la trame que le visiteur « envoie » au site :
 * Ethernet II, IPv4, TCP, puis une requête HTTP faite de ses vraies valeurs
 * (agent utilisateur, langue). Les sommes de contrôle sont calculées comme
 * le ferait la pile réseau. Chaque champ connaît sa plage d'octets, pour
 * l'affichage façon Wireshark.
 */

export interface Field {
  layer: Layer;
  name: string;
  value: string;
  start: number;
  /** Fin exclue. */
  end: number;
}

export type Layer = 'Ethernet II' | 'IPv4' | 'TCP' | 'HTTP';

export interface Packet {
  bytes: Uint8Array;
  fields: Field[];
  /** Plage de la charge utile applicative (HTTP). */
  payload: { start: number; end: number };
}

export interface PacketInput {
  srcIp: string;
  dstIp: string;
  srcPort: number;
  dstPort: number;
  seq: number;
  ack: number;
  id: number;
  host: string;
  userAgent: string;
  language: string;
}

/** Somme de contrôle Internet (RFC 1071) : complément à un de la somme sur 16 bits. */
export function internetChecksum(bytes: Uint8Array): number {
  let sum = 0;
  for (let i = 0; i < bytes.length; i += 2) {
    sum += (bytes[i]! << 8) + (bytes[i + 1] ?? 0);
    while (sum > 0xffff) sum = (sum & 0xffff) + (sum >>> 16);
  }
  return ~sum & 0xffff;
}

export function ipBytes(ip: string): number[] {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) throw new Error(`IPv4 invalide : ${ip}`);
  return parts;
}

const hex2 = (n: number) => n.toString(16).padStart(2, '0');
const hex4 = (n: number) => `0x${n.toString(16).padStart(4, '0')}`;

export function buildPacket(input: PacketInput): Packet {
  const fields: Field[] = [];
  const out: number[] = [];
  const push = (layer: Layer, name: string, value: string, bytes: number[]) => {
    fields.push({ layer, name, value, start: out.length, end: out.length + bytes.length });
    out.push(...bytes);
  };
  const u16 = (n: number) => [(n >>> 8) & 0xff, n & 0xff];
  const u32 = (n: number) => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];

  const http =
    `GET / HTTP/1.1\r\nHost: ${input.host}\r\nUser-Agent: ${input.userAgent}\r\n` +
    `Accept-Language: ${input.language}\r\nConnection: keep-alive\r\n\r\n`;
  const payload = [...new TextEncoder().encode(http)];

  // Ethernet II
  const dstMac = [0x00, 0x1b, 0x21, 0x3a, 0x4f, 0x01];
  const srcMac = [0x3c, 0x7c, 0x3f, 0xa1, 0x0e, 0x42];
  push('Ethernet II', 'Destination', dstMac.map(hex2).join(':'), dstMac);
  push('Ethernet II', 'Source', srcMac.map(hex2).join(':'), srcMac);
  push('Ethernet II', 'Type', 'IPv4 (0x0800)', [0x08, 0x00]);

  // IPv4 (sans options : 20 octets)
  const ipStart = out.length;
  const totalLength = 20 + 20 + payload.length;
  push('IPv4', 'Version, IHL', '4, 20 octets', [0x45]);
  push('IPv4', 'DSCP / ECN', '0x00', [0x00]);
  push('IPv4', 'Longueur totale', String(totalLength), u16(totalLength));
  push('IPv4', 'Identification', hex4(input.id), u16(input.id));
  push('IPv4', 'Drapeaux', "0x4000, Don't fragment", [0x40, 0x00]);
  push('IPv4', 'TTL', '64', [64]);
  push('IPv4', 'Protocole', 'TCP (6)', [6]);
  const ipChecksumField = out.length;
  push('IPv4', 'Somme de contrôle', '', [0, 0]);
  push('IPv4', 'Source', input.srcIp, ipBytes(input.srcIp));
  push('IPv4', 'Destination', input.dstIp, ipBytes(input.dstIp));
  const ipSum = internetChecksum(Uint8Array.from(out.slice(ipStart, ipStart + 20)));
  out[ipChecksumField] = ipSum >>> 8;
  out[ipChecksumField + 1] = ipSum & 0xff;
  fields.find((f) => f.start === ipChecksumField)!.value = `${hex4(ipSum)} [correcte]`;

  // TCP (sans options : 20 octets)
  const tcpStart = out.length;
  push('TCP', 'Port source', String(input.srcPort), u16(input.srcPort));
  push('TCP', 'Port destination', `${input.dstPort} (http)`, u16(input.dstPort));
  push('TCP', 'Numéro de séquence', String(input.seq >>> 0), u32(input.seq));
  push('TCP', 'Numéro d’acquittement', String(input.ack >>> 0), u32(input.ack));
  push('TCP', 'Longueur d’en-tête, drapeaux', '20 octets, [PSH, ACK]', [0x50, 0x18]);
  push('TCP', 'Fenêtre', '64240', u16(64240));
  const tcpChecksumField = out.length;
  push('TCP', 'Somme de contrôle', '', [0, 0]);
  push('TCP', 'Pointeur urgent', '0', [0, 0]);

  const payloadStart = out.length;
  const lines = http.split('\r\n').filter(Boolean);
  let offset = 0;
  for (const line of lines) {
    const len = new TextEncoder().encode(line + '\r\n').length;
    fields.push({ layer: 'HTTP', name: line.split(':')[0]!.split(' ')[0]!, value: line, start: payloadStart + offset, end: payloadStart + offset + len });
    offset += len;
  }
  out.push(...payload);

  // Somme TCP sur pseudo-en-tête (src, dst, 0, proto, longueur TCP) + segment.
  const tcpLength = out.length - tcpStart;
  const pseudo = [...ipBytes(input.srcIp), ...ipBytes(input.dstIp), 0, 6, ...u16(tcpLength), ...out.slice(tcpStart)];
  const tcpSum = internetChecksum(Uint8Array.from(pseudo));
  out[tcpChecksumField] = tcpSum >>> 8;
  out[tcpChecksumField + 1] = tcpSum & 0xff;
  fields.find((f) => f.start === tcpChecksumField)!.value = `${hex4(tcpSum)} [correcte]`;

  return { bytes: Uint8Array.from(out), fields, payload: { start: payloadStart, end: out.length } };
}

/** Lignes du vidage hexadécimal : décalage, 16 octets, ASCII. */
export function hexRows(bytes: Uint8Array): { offset: string; bytes: number[] }[] {
  const rows: { offset: string; bytes: number[] }[] = [];
  for (let i = 0; i < bytes.length; i += 16) rows.push({ offset: i.toString(16).padStart(4, '0'), bytes: [...bytes.slice(i, i + 16)] });
  return rows;
}

export const printable = (b: number) => (b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : '.');
