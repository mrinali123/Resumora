import { ImageResponse } from 'next/og';

export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 8,
          background: 'linear-gradient(135deg, #1e1b4b 0%, #3730a3 50%, #2563eb 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
        }}
      >
        {/* Subtle glow dot */}
        <div
          style={{
            position: 'absolute',
            top: 5,
            right: 5,
            width: 5,
            height: 5,
            borderRadius: '50%',
            background: '#60a5fa',
            opacity: 0.9,
          }}
        />
        {/* R lettermark */}
        <div
          style={{
            fontSize: 20,
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
