// Only classify known software paths; private/unknown driver strings retain
// the ordinary capability and device-hint policy. Never log/store the string.
export function softwareRenderer(description: unknown) {
  return typeof description === "string" && /swiftshader|llvmpipe|softpipe|software rasterizer|microsoft basic render driver/i.test(description);
}
