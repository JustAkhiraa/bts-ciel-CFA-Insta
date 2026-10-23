/* MD5 (RFC 1321). Web Crypto ne le fournit pas — il est cassé pour la
   sécurité, mais il reste partout : les anciens PDF protégés en dépendent,
   et bien des sites publient encore l'empreinte MD5 de leurs fichiers. */

const S = [7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
  5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
  4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
  6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21];
const K = new Uint32Array(64);
for (let i = 0; i < 64; i++) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) >>> 0;

/* Un MD5 qu'on nourrit morceau par morceau : un fichier de plusieurs
   centaines de Mo n'a pas besoin d'être entier en mémoire. */
export class Md5 {
  constructor() {
    this.h = new Uint32Array([0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476]);
    this.reste = new Uint8Array(64);
    this.nReste = 0;
    this.total = 0;
    this.M = new Uint32Array(16);
  }
  bloc(b, o) {
    const M = this.M;
    for (let i = 0; i < 16; i++) M[i] = b[o + 4 * i] | (b[o + 4 * i + 1] << 8) | (b[o + 4 * i + 2] << 16) | (b[o + 4 * i + 3] << 24);
    let [a, bb, c, d] = this.h;
    for (let i = 0; i < 64; i++) {
      let f, g;
      if (i < 16) { f = (bb & c) | (~bb & d); g = i; }
      else if (i < 32) { f = (d & bb) | (~d & c); g = (5 * i + 1) % 16; }
      else if (i < 48) { f = bb ^ c ^ d; g = (3 * i + 5) % 16; }
      else { f = c ^ (bb | ~d); g = (7 * i) % 16; }
      f = (f + a + K[i] + M[g]) >>> 0;
      a = d; d = c; c = bb;
      bb = (bb + ((f << S[i]) | (f >>> (32 - S[i])))) >>> 0;
    }
    this.h[0] += a; this.h[1] += bb; this.h[2] += c; this.h[3] += d;
  }
  ajouter(o) {
    let i = 0;
    this.total += o.length;
    if (this.nReste) {
      while (i < o.length && this.nReste < 64) this.reste[this.nReste++] = o[i++];
      if (this.nReste === 64) { this.bloc(this.reste, 0); this.nReste = 0; }
    }
    for (; i + 64 <= o.length; i += 64) this.bloc(o, i);
    while (i < o.length) this.reste[this.nReste++] = o[i++];
    return this;
  }
  fin() {
    const bits = this.total * 8;
    const pad = new Uint8Array(((this.nReste < 56 ? 56 : 120) - this.nReste) + 8);
    pad[0] = 0x80;
    const n = pad.length;
    for (let k = 0; k < 8; k++) pad[n - 8 + k] = Math.floor(bits / 2 ** (8 * k)) & 255;
    this.ajouter(pad);
    const out = new Uint8Array(16);
    for (let i = 0; i < 4; i++) for (let k = 0; k < 4; k++) out[4 * i + k] = (this.h[i] >>> (8 * k)) & 255;
    return out;
  }
}
export const md5 = (o) => new Md5().ajouter(o).fin();
