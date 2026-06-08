// Re-export the Auth.js route handlers for the App Router catch-all endpoint.
// Handles /api/auth/signin, /callback, /signout, /session, etc.
import { handlers } from "@/auth";

export const { GET, POST } = handlers;
