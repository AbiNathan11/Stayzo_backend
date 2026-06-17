import crypto from 'crypto';

const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16;

// Helper to derive a 32-byte key from whatever is provided in the env var
const getEncryptionKey = (): Buffer => {
  const secret = process.env.CHAT_ENCRYPTION_KEY;
  if (!secret) {
    console.warn('WARNING: CHAT_ENCRYPTION_KEY is not set in environment. Using a fallback insecure key for development. DO NOT DO THIS IN PRODUCTION.');
    return crypto.createHash('sha256').update('fallback_insecure_key_12345').digest();
  }
  return crypto.createHash('sha256').update(secret).digest();
};

export const encryptMessage = (text: string): string => {
  if (!text) return text;

  try {
    const iv = crypto.randomBytes(IV_LENGTH);
    const key = getEncryptionKey();
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    return `${iv.toString('hex')}:${encrypted}`;
  } catch (error) {
    console.error('Encryption error:', error);
    return text; // Fallback in case of absolute failure, though we shouldn't fail silently in production ideally.
  }
};

export const decryptMessage = (encryptedText: string | null | undefined): string => {
  if (!encryptedText) return '';

  // Check if it's actually encrypted (has iv and ciphertext separated by ':')
  const parts = encryptedText.split(':');
  if (parts.length !== 2) {
    // If it doesn't match our format, assume it's legacy plaintext
    return encryptedText;
  }

  const [ivHex, ciphertextHex] = parts;
  
  if (ivHex.length !== IV_LENGTH * 2) {
    return encryptedText; // Probably not our encrypted string
  }

  try {
    const iv = Buffer.from(ivHex, 'hex');
    const key = getEncryptionKey();
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    
    let decrypted = decipher.update(ciphertextHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    console.error('Decryption error:', error);
    // If decryption fails (e.g. wrong key, tampered data, or just an accidental string with a colon), return original
    return encryptedText;
  }
};
