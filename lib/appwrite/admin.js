/**
 * Server-side Appwrite client (API key). Used for password reset tokens
 * and other admin Users/Databases operations from API routes.
 */
import { Client, Users, Databases, Account, Query } from "node-appwrite";
import { APPWRITE_CONFIG, COLLECTIONS } from "./config.js";

export function getAppwriteAdminConfig() {
  const endpoint =
    process.env.DEST_APPWRITE_ENDPOINT ||
    process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT ||
    APPWRITE_CONFIG.endpoint;
  const projectId =
    process.env.DEST_APPWRITE_PROJECT_ID ||
    process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID ||
    APPWRITE_CONFIG.projectId;
  const apiKey =
    process.env.APPWRITE_API_KEY ||
    process.env.DEST_APPWRITE_API_KEY ||
    process.env.NEXT_PUBLIC_APPWRITE_API_KEY;
  const databaseId =
    process.env.DEST_APPWRITE_DATABASE_ID ||
    process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID ||
    APPWRITE_CONFIG.databaseId;

  return { endpoint, projectId, apiKey, databaseId };
}

export function createAdminClient() {
  const { endpoint, projectId, apiKey, databaseId } = getAppwriteAdminConfig();

  if (!projectId || !apiKey) {
    throw new Error(
      "Missing Appwrite API key. Set APPWRITE_API_KEY (or DEST_APPWRITE_API_KEY) in .env"
    );
  }

  const client = new Client()
    .setEndpoint(endpoint)
    .setProject(projectId)
    .setKey(apiKey);

  return {
    client,
    users: new Users(client),
    databases: new Databases(client),
    databaseId,
    Query,
    COLLECTIONS,
  };
}

/** Public (no API key) Account client — used to verify recovery/session tokens. */
export function createPublicAccountClient() {
  const { endpoint, projectId } = getAppwriteAdminConfig();
  const client = new Client().setEndpoint(endpoint).setProject(projectId);
  return { client, account: new Account(client) };
}

/**
 * Resolve the public app base URL for email links.
 * Prefers the incoming request host so local ports stay correct.
 */
export function resolveAppBaseUrl(request) {
  const envUrl = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
  const origin = request?.headers?.get?.("origin");
  if (origin && /^https?:\/\//i.test(origin)) {
    return origin.replace(/\/$/, "");
  }

  const host =
    request?.headers?.get?.("x-forwarded-host") ||
    request?.headers?.get?.("host");
  const proto =
    request?.headers?.get?.("x-forwarded-proto") ||
    (host?.includes("localhost") ? "http" : "https");

  if (host) {
    return `${proto}://${host}`.replace(/\/$/, "");
  }

  return envUrl || "http://localhost:3000";
}
