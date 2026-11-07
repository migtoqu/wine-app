// Genera los PNG de la PWA a partir del SVG del logo. Ejecutar tras cambiar el icono:
//   node scripts/generate-icons.mjs
// Usa sharp, que ya viene como dependencia de Next.
import { writeFile } from "node:fs/promises";
import sharp from "sharp";

const BG = "#7b1e3a";
const FG = "#faf7f2";

// Copa de vino sobre 32x32 (misma forma que LogoMark).
const glass = `<path d="M9 4h14c.6 4.6.2 8.4-1.6 10.8A7.4 7.4 0 0 1 17.2 17.6V25h4.3v2.5h-11V25h4.3v-7.4a7.4 7.4 0 0 1-4.2-2.8C8.8 12.4 8.4 8.6 9 4Z" fill="${FG}"/><path d="M10.2 9.5h11.6c-.2 2-.8 3.6-1.7 4.6-1 1.2-2.4 1.9-4.1 1.9s-3.1-.7-4.1-1.9c-.9-1-1.5-2.6-1.7-4.6Z" fill="${BG}" opacity="0.35"/>`;

// scale: tamaño de la copa respecto al lienzo (las maskable necesitan margen de seguridad del 80%).
function svg({ rounded, scale }) {
  const offset = (32 - 32 * scale) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="${rounded ? 7 : 0}" fill="${BG}"/>
  <g transform="translate(${offset} ${offset}) scale(${scale})">${glass}</g>
</svg>
`;
}

const favicon = svg({ rounded: true, scale: 0.9 });
await writeFile("src/app/icon.svg", favicon);

const targets = [
  { file: "public/icons/icon-192.png", size: 192, rounded: true, scale: 0.85 },
  { file: "public/icons/icon-512.png", size: 512, rounded: true, scale: 0.85 },
  { file: "public/icons/maskable-512.png", size: 512, rounded: false, scale: 0.6 },
  // iOS redondea las esquinas por su cuenta.
  { file: "src/app/apple-icon.png", size: 180, rounded: false, scale: 0.75 },
];

for (const { file, size, rounded, scale } of targets) {
  await sharp(Buffer.from(svg({ rounded, scale })), { density: 72 * (size / 32) })
    .resize(size, size)
    .png()
    .toFile(file);
  console.log("✓", file);
}
