import * as React from "react";

interface SpatialTiltProps {
  children: React.ReactNode;
  className?: string;
  maxTilt?: number;
  scale?: number;
  perspective?: number;
  glare?: boolean;
}

export function SpatialTilt({
  children,
  className = "",
  maxTilt = 5,
  scale = 1.012,
  perspective = 1200,
  glare = true,
}: SpatialTiltProps) {
  const outerRef = React.useRef<HTMLDivElement>(null);
  const glareRef = React.useRef<HTMLDivElement>(null);
  const rafRef = React.useRef<number>(0);
  const canTiltRef = React.useRef(false);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const finePointer = window.matchMedia?.("(pointer: fine)").matches;
    canTiltRef.current = !reduced && !!finePointer;
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!canTiltRef.current || e.pointerType !== "mouse") return;
    const el = outerRef.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const px = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const py = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    const rx = (0.5 - py) * maxTilt * 2;
    const ry = (px - 0.5) * maxTilt * 2;

    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      el.style.transform = `perspective(${perspective}px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) scale3d(${scale}, ${scale}, ${scale})`;
      if (glareRef.current && glare) {
        glareRef.current.style.opacity = "1";
        glareRef.current.style.background = `radial-gradient(420px circle at ${(px * 100).toFixed(1)}% ${(py * 100).toFixed(1)}%, rgba(255, 255, 255, 0.28), rgba(255, 255, 255, 0) 60%)`;
      }
    });
  };

  const handlePointerLeave = () => {
    const el = outerRef.current;
    if (!el) return;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    el.style.transform = `perspective(${perspective}px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)`;
    if (glareRef.current && glare) {
      glareRef.current.style.opacity = "0";
    }
  };

  return (
    <div
      ref={outerRef}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      className={`spatial-tilt-stage ${className}`}
      style={{
        transformStyle: "preserve-3d",
        transition: "transform 340ms cubic-bezier(0.16, 1, 0.3, 1)",
        willChange: "transform",
      }}
    >
      {glare && (
        <div
          ref={glareRef}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-[inherit] z-20 transition-opacity duration-300 opacity-0"
        />
      )}
      {children}
    </div>
  );
}
