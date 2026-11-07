import type { NextConfig } from "next";

const config: NextConfig = {
  serverExternalPackages: ['@node-rs/argon2', 'pg'],
  // One-time links and prior Server Action state must not enter development
  // logs. Deployment access logs/error tracking need the same redaction.
  logging: {
    incomingRequests: { ignore: [/\/invite(?:\/|\?|$)/, /\/auth\/confirm(?:\/|\?|$)/, /\/api\/superadmin(?:\/|\?|$)/] },
    serverFunctions: false,
    fetches: { fullUrl: false },
  },
};
export default config;
