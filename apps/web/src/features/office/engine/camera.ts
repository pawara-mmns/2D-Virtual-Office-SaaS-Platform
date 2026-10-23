export function officeZoom(requested: number, viewWidth: number, viewHeight: number, mapWidth: number, mapHeight: number) {
  const minimum = Math.max(1, Math.ceil(Math.max(viewWidth / mapWidth, viewHeight / mapHeight)));
  return Math.max(minimum, Math.min(Math.max(4, minimum), Math.round(requested)));
}
