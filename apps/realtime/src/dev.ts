// Watch-mode entry point. The compiled production entry fails closed by default.
process.env.NODE_ENV ??= "development";
await import("./index.ts");
