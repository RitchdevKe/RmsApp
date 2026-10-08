
// Security Utilities for TaskMe Realty
// Provides hashing for passwords and obfuscation for local storage persistence.

/** SHA-256 when Web Crypto `subtle` is unavailable (non-secure contexts: e.g. http://LAN-IP:port). */
function sha256HexSyncUtf8(message: string): string {
    const rotr = (n: number, x: number) => (x >>> n) | (x << (32 - n));
    const shr = (n: number, x: number) => x >>> n;
    const sigma0 = (x: number) => rotr(2, x) ^ rotr(13, x) ^ rotr(22, x);
    const sigma1 = (x: number) => rotr(6, x) ^ rotr(11, x) ^ rotr(25, x);
    const gamma0 = (x: number) => rotr(7, x) ^ rotr(18, x) ^ shr(3, x);
    const gamma1 = (x: number) => rotr(17, x) ^ rotr(19, x) ^ shr(10, x);

    const K = new Uint32Array([
        0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
        0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
        0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
        0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
        0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
        0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
        0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
        0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
    ]);

    let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
    let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;

    const data = new TextEncoder().encode(message);
    const bitLen = BigInt(data.length) * 8n;
    const paddedLen = Math.ceil((data.length + 9) / 64) * 64;
    const padded = new Uint8Array(paddedLen);
    padded.set(data);
    padded[data.length] = 0x80;
    new DataView(padded.buffer).setBigUint64(paddedLen - 8, bitLen, false);

    const w = new Uint32Array(64);
    const dv = new DataView(padded.buffer);

    for (let chunk = 0; chunk < paddedLen; chunk += 64) {
        for (let i = 0; i < 16; i++) w[i] = dv.getUint32(chunk + i * 4, false);
        for (let i = 16; i < 64; i++) {
            w[i] = (gamma1(w[i - 2]) + w[i - 7] + gamma0(w[i - 15]) + w[i - 16]) >>> 0;
        }
        let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
        for (let i = 0; i < 64; i++) {
            const t1 = (h + sigma1(e) + ((e & f) ^ (~e & g)) + K[i] + w[i]) >>> 0;
            const t2 = (sigma0(a) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
            h = g;
            g = f;
            f = e;
            e = (d + t1) >>> 0;
            d = c;
            c = b;
            b = a;
            a = (t1 + t2) >>> 0;
        }
        h0 = (h0 + a) >>> 0;
        h1 = (h1 + b) >>> 0;
        h2 = (h2 + c) >>> 0;
        h3 = (h3 + d) >>> 0;
        h4 = (h4 + e) >>> 0;
        h5 = (h5 + f) >>> 0;
        h6 = (h6 + g) >>> 0;
        h7 = (h7 + h) >>> 0;
    }

    const out = new Uint8Array(32);
    const odv = new DataView(out.buffer);
    odv.setUint32(0, h0, false);
    odv.setUint32(4, h1, false);
    odv.setUint32(8, h2, false);
    odv.setUint32(12, h3, false);
    odv.setUint32(16, h4, false);
    odv.setUint32(20, h5, false);
    odv.setUint32(24, h6, false);
    odv.setUint32(28, h7, false);
    return Array.from(out).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Hashes a password using SHA-256 (Web Crypto when available; pure JS fallback otherwise).
 * `crypto.subtle` is only available in secure contexts (HTTPS, localhost). Opening the app as
 * http://192.168.x.x triggers the fallback so CMS user creation still works on LAN dev servers.
 */
export const hashPassword = async (password: string): Promise<string> => {
    const subtle = globalThis.crypto?.subtle;
    if (typeof subtle?.digest === 'function') {
        const msgBuffer = new TextEncoder().encode(password);
        const hashBuffer = await subtle.digest('SHA-256', msgBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }
    return sha256HexSyncUtf8(password);
};

/**
 * Encrypts data for local storage (Obfuscation).
 * In a production environment, this should use AES-GCM with a user-derived key.
 * For this demo, we use Base64 encoding to prevent plain-text reading in dev tools.
 * @param data The JSON string to encrypt.
 */
export const encryptData = (data: string): string => {
    try {
        // Prefix to identify encrypted data and versioning
        return 'ENC_v1_' + btoa(encodeURIComponent(data));
    } catch (e) {
        console.error("Encryption error", e);
        return data;
    }
};

/**
 * Decrypts data from local storage.
 * @param data The encrypted string.
 */
export const decryptData = (data: string): string => {
    try {
        if (data && data.startsWith('ENC_v1_')) {
            return decodeURIComponent(atob(data.substring(7)));
        }
        // Backward compatibility: return as-is if not encrypted
        return data;
    } catch (e) {
        console.error("Decryption error", e);
        return data; 
    }
};
