import crypto from 'node:crypto';

export interface EncryptedSecret {
  ciphertext: string;
  iv: string;
  authTag: string;
}

const DEV_FALLBACK_SEED = 'reviewflow-local-dev-master-key-change-in-production';

function getMasterKey(): Buffer {
  const raw = process.env.API_KEY_ENCRYPTION_SECRET?.trim();
  if (!raw || raw === 'CHANGE_ME_TO_A_32_BYTE_RANDOM_SECRET') {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'API_KEY_ENCRYPTION_SECRET must be set in production to encrypt business API keys.',
      );
    }
    return crypto.createHash('sha256').update(DEV_FALLBACK_SEED).digest();
  }
  if (/^[0-9a-f]{64}$/i.test(raw)) {
    return Buffer.from(raw, 'hex');
  }
  return crypto.createHash('sha256').update(raw).digest();
}

export function encryptApiKey(plaintext: string): EncryptedSecret {
  const key = getMasterKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    ciphertext: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
  };
}

export function decryptApiKey(secret: EncryptedSecret): string {
  const key = getMasterKey();
  const iv = Buffer.from(secret.iv, 'base64');
  const authTag = Buffer.from(secret.authTag, 'base64');
  const ciphertext = Buffer.from(secret.ciphertext, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString('utf8');
}

export function maskApiKey(apiKey: string): string {
  const trimmed = apiKey.trim();
  if (trimmed.length <= 8) return '••••••••';
  return `${trimmed.slice(0, 6)}••••${trimmed.slice(-4)}`;
}
