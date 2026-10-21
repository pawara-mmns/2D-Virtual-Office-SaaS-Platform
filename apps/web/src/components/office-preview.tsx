/** Static artwork only. Coordinates use a 32px logical tile grid. */
export function OfficePreview() {
  return (
    <figure className="overflow-hidden rounded-2xl border border-line bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
        <span className="text-sm font-semibold text-ink">Room to feel connected</span>
        <span className="rounded-sm bg-surface px-2 py-1 font-mono text-[10px] tracking-wider text-muted uppercase">
          Office concept
        </span>
      </div>
      <div className="bg-[#e7ece4] p-4 sm:p-8">
        <svg
          viewBox="0 0 512 352"
          role="img"
          aria-labelledby="office-title office-description"
          className="pixel-art mx-auto h-auto w-full max-w-[640px]"
          shapeRendering="crispEdges"
        >
          <title id="office-title">A small office with space to focus and connect</title>
          <desc id="office-description">
            Original top-down pixel illustration with desks, computers, chairs,
            a meeting table, a lounge, and plants. An illustration of the planned
            visual direction, not an interactive office.
          </desc>
          <defs>
            <pattern id="floor" width="32" height="32" patternUnits="userSpaceOnUse">
              <rect width="32" height="32" fill="#eee7d7" />
              <path d="M0 31h32M31 0v32" stroke="#e2dbc9" />
            </pattern>
            <g id="desk">
              <rect x="0" y="4" width="64" height="32" fill="#a17853" />
              <rect width="64" height="28" fill="#d3ad7b" />
              <rect x="18" y="2" width="28" height="18" fill="#344b46" />
              <rect x="21" y="4" width="22" height="12" fill="#9ebfb5" />
              <path d="M30 20h4v4h-4zM22 24h20v2H22z" fill="#53645b" />
              <rect x="50" y="17" width="6" height="7" fill="#faf5e7" />
              <rect x="23" y="40" width="18" height="16" fill="#40594f" />
              <rect x="20" y="50" width="24" height="8" fill="#6c8772" />
              <path d="M24 58h4v4h-4zM36 58h4v4h-4z" fill="#344b46" />
            </g>
            <g id="plant">
              <path d="M8 20h16v12H8z" fill="#ac7958" />
              <path d="M4 4h8V0h8v4h8v8h4v8H20v4h-8v-4H0v-8h4z" fill="#53774e" />
              <path d="M8 8h8V4h4v8h-4v8h-4v-4H8z" fill="#88a66a" />
            </g>
          </defs>
          <rect x="8" y="24" width="496" height="320" fill="#c8cebf" />
          <rect y="8" width="504" height="320" fill="#70816f" />
          <rect x="8" y="16" width="488" height="304" fill="url(#floor)" />
          <path d="M8 16h488v24H8z" fill="#c2ccba" />
          <path d="M8 40h488v8H8z" fill="#a0b39b" />
          <path d="M64 16h96v20H64zM288 16h128v20H288z" fill="#e6f1eb" />
          <path d="M108 16h8v20h-8zM348 16h8v20h-8z" fill="#a0b39b" />
          <rect x="32" y="64" width="224" height="160" fill="#d6ddca" />
          <use href="#desk" x="48" y="80" />
          <use href="#desk" x="160" y="80" />
          <use href="#desk" x="48" y="160" />
          <use href="#desk" x="160" y="160" />
          <use href="#plant" x="16" y="48" />
          <use href="#plant" x="240" y="48" />
          <path d="M280 48h8v184h-8zM280 224h48v8h-48zM392 224h96v8h-96z" fill="#a0b39b" />
          <rect x="312" y="72" width="144" height="128" fill="#e0d6bd" />
          <path d="M336 80h20v20h-20zM400 80h20v20h-20zM336 168h20v20h-20zM400 168h20v20h-20z" fill="#6c8772" />
          <rect x="320" y="108" width="128" height="56" fill="#a17853" />
          <rect x="320" y="104" width="128" height="52" fill="#d3ad7b" />
          <rect x="360" y="116" width="24" height="20" fill="#f8f4e8" />
          <path d="M364 120h16v2h-16zM364 126h12v2h-12z" fill="#a0b39b" />
          <rect x="404" y="120" width="8" height="8" fill="#53774e" />
          <use href="#plant" x="456" y="48" />
          <rect x="48" y="256" width="176" height="48" fill="#cdcdb7" />
          <rect x="48" y="248" width="96" height="32" fill="#6c8772" />
          <path d="M48 244h96v8H48zM44 248h8v32h-8zM140 248h8v32h-8z" fill="#40594f" />
          <path d="M80 252h4v20h-4zM112 252h4v20h-4z" fill="#53774e" />
          <rect x="168" y="264" width="40" height="24" fill="#a17853" />
          <rect x="168" y="260" width="40" height="24" fill="#d3ad7b" />
          <rect x="176" y="264" width="12" height="12" fill="#f8f4e8" />
          <use href="#plant" x="240" y="272" />
          <path d="M336 264h112v40H336z" fill="#a17853" />
          <path d="M336 260h112v12H336z" fill="#d3ad7b" />
          <path d="M348 276h40v20h-40zM396 276h40v20h-40z" fill="#c09567" />
          <path d="M352 244h20v16h-20z" fill="#344b46" />
          <path d="M356 248h12v8h-12zM400 252h8v8h-8zM416 252h8v8h-8z" fill="#f8f4e8" />
          <use href="#plant" x="456" y="280" />
          <path d="M280 312h48v8h-48z" fill="#d3ad7b" />
        </svg>
      </div>
      <figcaption className="flex flex-wrap items-center justify-between gap-2 px-5 py-4 text-xs text-muted">
        <span>A shared space. A more human workday.</span>
        <span className="font-mono text-[10px] uppercase tracking-wider">Pixel by pixel</span>
      </figcaption>
    </figure>
  );
}
