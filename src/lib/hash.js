import bcrypt from "bcryptjs";

const SALT_ROUNDS = 10;

export async function hashPassword(plain) {
  const salt = await bcrypt.genSalt(SALT_ROUNDS);
  return bcrypt.hash(String(plain), salt);
}
