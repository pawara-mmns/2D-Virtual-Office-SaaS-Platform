import type { NextConfig } from "next";

const config: NextConfig = {
  // Secret link paths must not appear in Next's development access log.
  // Deployment access logs/error tracking also need the redaction in docs.
  logging: { incomingRequests: { ignore: [/\/invite(?:\/|\?|$)/] }, fetches: { fullUrl: false } },
};
export default config;
