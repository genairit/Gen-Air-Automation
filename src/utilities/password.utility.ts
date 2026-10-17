import { scrypt, randomBytes } from "node:crypto";

// Mirrors Gen-Air-Backend's password.utility.ts so seeded users can log in through the real flow.
const PASSWORD_HASHING = {
  SALT_BYTES: 16,
  KEY_LENGTH: 64,
  SEPARATOR: ":",
} as const;

const deriveKey = (password: string, salt: Buffer) =>
  new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, PASSWORD_HASHING.KEY_LENGTH, (error, key) => {
      if (error) {
        reject(error);

        return;
      }

      resolve(key);
    });
  });

export const hashPassword = async (password: string): Promise<string> => {
  const salt = randomBytes(PASSWORD_HASHING.SALT_BYTES);
  const key = await deriveKey(password, salt);

  return [salt.toString("hex"), key.toString("hex")].join(PASSWORD_HASHING.SEPARATOR);
};
