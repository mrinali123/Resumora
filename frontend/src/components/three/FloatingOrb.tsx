"use client";

export default function FloatingOrb({ className = "" }: { className?: string }) {
  return (
    <div className={`w-full h-full flex items-center justify-center select-none pointer-events-none ${className}`}
      style={{ perspective: "600px" }}
    >
      <div className="relative" style={{ width: 200, height: 200 }}>

        {/* Outermost ambient glow */}
        <div className="absolute inset-0 rounded-full" style={{
          background: "radial-gradient(circle, rgba(139,92,246,0.15) 0%, transparent 70%)",
          transform: "scale(1.8)",
          animation: "pulse 4s ease-in-out infinite",
        }} />

        {/* Outer ring — slow spin */}
        <div className="absolute inset-0 rounded-full" style={{
          border: "1px solid rgba(139,92,246,0.2)",
          transform: "rotateX(72deg)",
          animation: "spin 18s linear infinite",
          boxShadow: "0 0 12px rgba(139,92,246,0.1)",
        }} />

        {/* Middle ring — opposite spin */}
        <div className="absolute rounded-full" style={{
          inset: "16px",
          border: "1px solid rgba(6,182,212,0.25)",
          transform: "rotateX(60deg) rotateZ(30deg)",
          animation: "spin 12s linear infinite reverse",
          boxShadow: "0 0 10px rgba(6,182,212,0.1)",
        }} />

        {/* Inner ring */}
        <div className="absolute rounded-full" style={{
          inset: "34px",
          border: "1px solid rgba(167,139,250,0.3)",
          transform: "rotateX(50deg) rotateY(20deg)",
          animation: "spin 8s linear infinite",
        }} />

        {/* Core orb */}
        <div className="absolute rounded-full" style={{
          inset: "44px",
          background: "radial-gradient(circle at 38% 32%, #c4b5fd, #7c3aed 45%, #3b0764 100%)",
          boxShadow: "0 0 20px rgba(124,58,237,0.6), 0 0 40px rgba(124,58,237,0.3), 0 0 80px rgba(124,58,237,0.15), inset 0 0 20px rgba(255,255,255,0.08)",
          animation: "float 6s ease-in-out infinite",
        }}>
          {/* Specular highlight */}
          <div className="absolute rounded-full" style={{
            top: "14%", left: "20%",
            width: "32%", height: "22%",
            background: "rgba(255,255,255,0.25)",
            filter: "blur(4px)",
            transform: "rotate(-20deg)",
          }} />
        </div>

        {/* Orbiting dot 1 — cyan */}
        <div className="absolute" style={{
          inset: "28px",
          animation: "spin 4s linear infinite",
        }}>
          <div style={{
            position: "absolute", top: 0, left: "50%",
            width: 7, height: 7, marginLeft: -3.5, marginTop: -3.5,
            borderRadius: "50%",
            background: "#06b6d4",
            boxShadow: "0 0 10px #06b6d4, 0 0 20px rgba(6,182,212,0.5)",
          }} />
        </div>

        {/* Orbiting dot 2 — violet, tilted plane */}
        <div className="absolute" style={{
          inset: "14px",
          transform: "rotateX(70deg)",
          animation: "spin 7s linear infinite reverse",
        }}>
          <div style={{
            position: "absolute", top: 0, left: "50%",
            width: 5, height: 5, marginLeft: -2.5, marginTop: -2.5,
            borderRadius: "50%",
            background: "#a78bfa",
            boxShadow: "0 0 8px #a78bfa",
          }} />
        </div>

        {/* Orbiting dot 3 — emerald */}
        <div className="absolute" style={{
          inset: "22px",
          transform: "rotateX(45deg) rotateZ(60deg)",
          animation: "spin 10s linear infinite",
        }}>
          <div style={{
            position: "absolute", top: 0, left: "50%",
            width: 4, height: 4, marginLeft: -2, marginTop: -2,
            borderRadius: "50%",
            background: "#10b981",
            boxShadow: "0 0 8px #10b981",
          }} />
        </div>

        {/* Scattered particles */}
        {[
          { size: 2, top: "8%",  left: "12%", delay: "0s",    dur: "3s",   color: "#a78bfa" },
          { size: 3, top: "15%", left: "80%", delay: "0.6s",  dur: "4s",   color: "#06b6d4" },
          { size: 2, top: "72%", left: "88%", delay: "1.2s",  dur: "2.5s", color: "#8b5cf6" },
          { size: 2, top: "85%", left: "20%", delay: "0.4s",  dur: "3.5s", color: "#a78bfa" },
          { size: 3, top: "50%", left: "5%",  delay: "1.8s",  dur: "4s",   color: "#10b981" },
          { size: 2, top: "30%", left: "92%", delay: "0.9s",  dur: "3s",   color: "#06b6d4" },
          { size: 2, top: "90%", left: "55%", delay: "2.1s",  dur: "2.8s", color: "#8b5cf6" },
          { size: 3, top: "5%",  left: "55%", delay: "1.5s",  dur: "3.2s", color: "#a78bfa" },
        ].map((p, i) => (
          <div key={i} style={{
            position: "absolute",
            top: p.top, left: p.left,
            width: p.size, height: p.size,
            borderRadius: "50%",
            background: p.color,
            boxShadow: `0 0 6px ${p.color}`,
            animation: `pulse ${p.dur} ease-in-out infinite ${p.delay}`,
          }} />
        ))}

        {/* Bottom reflection blur */}
        <div className="absolute" style={{
          bottom: -20, left: "50%", transform: "translateX(-50%)",
          width: 80, height: 16,
          background: "radial-gradient(ellipse, rgba(124,58,237,0.25) 0%, transparent 70%)",
          filter: "blur(6px)",
          animation: "float 6s ease-in-out infinite",
        }} />
      </div>
    </div>
  );
}
