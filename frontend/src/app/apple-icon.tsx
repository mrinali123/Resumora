import { ImageResponse } from 'next/og';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 180,
          height: 180,
          borderRadius: 40,
          background: 'linear-gradient(135deg, #1e1b4b 0%, #3730a3 50%, #2563eb 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
        }}
      >
        {/* Glow dot */}
        <div
          style={{
            position: 'absolute',
            top: 28,
            right: 28,
            width: 22,
            height: 22,
            borderRadius: '50%',
            background: '#60a5fa',
            opacity: 0.9,
          }}
        />
        {/* R lettermark */}
        <div
          style={{
            fontSize: 110,
            fontWeight: 800,
            color: 'white',
            fontFamily: 'serif',
            lineHeight: 1,
            letterSpacing: '-0.05em',
          }}
        >
          R
        </div>
      </div>
    ),
    { ...size },
  );
}
