import { ImageResponse } from 'next/og';

// Next App Router convention: `app/icon.tsx` generates the favicon at
// build time. Matches the sidebar brand square — Lucide Wallet glyph on
// the `#00a6d5` cyan background.
export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

export default function Icon(): ImageResponse {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#00a6d5',
          borderRadius: '6px',
          color: 'white',
        }}
      >
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 1-1 1v3a1 1 0 0 1-1 1H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2" />
          <path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" />
        </svg>
      </div>
    ),
    {
      ...size,
    },
  );
}
