// Better Auth's own endpoints: /api/auth/sign-in/email, /api/auth/sign-out, ...
import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth";

export const { GET, POST } = toNextJsHandler(auth);
