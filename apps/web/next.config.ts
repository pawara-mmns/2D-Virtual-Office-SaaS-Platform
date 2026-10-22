import type { NextConfig } from "next";

const config: NextConfig = {
  // One-time links and prior Server Action state must not enter development
  // logs. Deployment access logs/error tracking need the same redaction.
  logging: {
    incomingRequests: { ignore: [/\/invite(?:\/|\?|$)/, /\/auth\/confirm(?:\/|\?|$)/] },
    serverFunctions: false,
    fetches: { fullUrl: false },
  },
};
export default config;
