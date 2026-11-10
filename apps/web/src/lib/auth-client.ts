"use client";
// Browser side of sign-in. Pages call authClient.signIn.email(...), etc.
import { createAuthClient } from "better-auth/react";
import { magicLinkClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({ plugins: [magicLinkClient()] });
