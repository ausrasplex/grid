// Public API for blocks that depend on "users".
export { getUser, findUserByEmail, ensureUser, updateProfile, type PublicUser } from "./service";
export { emailSchema } from "./validation";
