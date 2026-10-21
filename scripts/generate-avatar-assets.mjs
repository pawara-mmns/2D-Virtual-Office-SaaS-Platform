import { pathToFileURL } from "node:url";
import { picture } from "./office-pixel-art.mjs";
import { avatarPresets } from "../apps/web/src/features/avatars/presets.ts";

// Original fixed designs, not a skin/wardrobe editor. Shared proportions and foot placement.
const palettes = [
  { shirt: "426c6e", light: "6a9890", skin: "d9a47f", shade: "b78364", hair: "4c3c36", highlight: "6d5141", pants: "354c60", style: "short" },
  { shirt: "426a87", light: "7f9faf", skin: "a86f51", shade: "82523e", hair: "bd995d", highlight: "ddbf83", pants: "39434c", style: "waves" },
  { shirt: "985b48", light: "c18b68", skin: "875a43", shade: "684333", hair: "302f30", highlight: "51443b", pants: "424850", style: "curls" },
  { shirt: "705467", light: "a17b91", skin: "e0b18e", shade: "bd8b70", hair: "343236", highlight: "55444f", pants: "4b4f61", style: "long" },
  { shirt: "9a7a3c", light: "c6a45f", skin: "9d6b4d", shade: "795039", hair: "393332", highlight: "5d4e42", pants: "45524d", style: "crop" },
  { shirt: "424f65", light: "71859a", skin: "c18b68", shade: "9b6b50", hair: "8e9692", highlight: "c4c8b7", pants: "454f4d", style: "glasses" },
];
export function generateAvatars() {
  const avatar = picture(96, avatarPresets.length * 128);
  const { rect: p, ellipse: oval } = avatar;
  for (const preset of avatarPresets) {
    const color = palettes[preset.index];
    for (let direction = 0; direction < 4; direction++) for (let frame = 0; frame < 3; frame++) {
      const x = frame * 32, y = preset.index * 128 + direction * 32;
      const step = frame === 1 ? -1 : frame === 2 ? 1 : 0;
      oval(x + 7, y + 27, 19, 4, "253d3b40");
      if (color.style === "long") { p(x + 9, y + 5, 15, 16, color.hair); p(x + 10, y + 10, 2, 10, color.highlight); }
      p(x + 11, y + 21, 5, 6 + step, color.pants); p(x + 17, y + 21, 5, 6 - step, color.pants);
      p(x + 10, y + 26 + step, 6, 3, "293b42"); p(x + 17, y + 26 - step, 6, 3, "293b42");
      p(x + 10, y + 13, 13, 11, color.shirt); p(x + 12, y + 14, 9, 8, color.light);
      if (["short", "waves", "long"].includes(color.style)) { p(x + 16, y + 15, 1, 8, color.shirt); p(x + 19, y + 17, 1, 1, "ded4b6"); }
      else { p(x + 13, y + 14, 8, 2, color.shirt); p(x + 11, y + 22, 12, 2, color.shirt); }
      p(x + 7, y + 15 + step, 4, 8, color.shirt); p(x + 23, y + 15 - step, 3, 8, color.shirt);
      p(x + 7, y + 22 + step, 4, 3, color.skin); p(x + 23, y + 22 - step, 3, 3, color.skin);
      p(x + 11, y + 4, 12, 11, color.skin); p(x + 12, y + 13, 10, 2, color.shade);
      p(x + 10, y + 3, 14, color.style === "crop" ? 4 : 6, color.hair); p(x + 12, y + 2, 10, 3, color.highlight);
      if (color.style === "waves") { p(x + 9, y + 5, 3, 5, color.hair); p(x + 21, y + 4, 4, 5, color.highlight); p(x + 15, y + 5, 5, 3, color.hair); }
      if (color.style === "curls") for (const [cx, cy] of [[10, 3], [14, 1], [19, 2], [22, 4]]) oval(x + cx, y + cy, 5, 5, color.hair);
      if (direction === 3) { p(x + 11, y + 6, 12, 8, color.hair); p(x + 13, y + 13, 8, 2, color.shade); }
      else if (direction === 1) { p(x + 10, y + 9, 3, 5, color.skin); p(x + 12, y + 9, 2, 2, "283b3b"); p(x + 21, y + 6, 3, 8, color.hair); }
      else if (direction === 2) { p(x + 22, y + 9, 3, 5, color.skin); p(x + 21, y + 9, 2, 2, "283b3b"); p(x + 10, y + 6, 3, 8, color.hair); }
      else { p(x + 13, y + 9, 2, 2, "283b3b"); p(x + 20, y + 9, 2, 2, "283b3b"); p(x + 16, y + 13, 4, 1, color.shade); }
      if (color.style === "glasses" && direction !== 3) {
        if (direction === 0) { p(x + 12, y + 9, 5, 3, "35454d"); p(x + 18, y + 9, 5, 3, "35454d"); p(x + 13, y + 10, 3, 1, "a5bdba"); p(x + 19, y + 10, 3, 1, "a5bdba"); p(x + 17, y + 10, 1, 1, "35454d"); }
        else p(x + (direction === 1 ? 10 : 21), y + 9, 4, 3, "35454d");
      }
    }
  }
  avatar.png("avatar.png");
  console.log("Generated six original avatar presets in one 96x768 sprite sheet.");
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) generateAvatars();
