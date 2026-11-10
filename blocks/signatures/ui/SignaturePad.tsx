"use client";

// Draw a signature with a finger, mouse or stylus, or type your name and
// use it in a handwriting font. Either way the result is a PNG.
import { useCallback, useEffect, useRef, useState } from "react";
import "@fontsource/caveat/700.css";
import { Button, Field, Segmented } from "@grid/ui";

export type SignMethod = "DRAWN" | "TYPED";

export function SignaturePad({
  allowDrawn,
  allowTyped,
  defaultName,
  onChange,
}: {
  allowDrawn: boolean;
  allowTyped: boolean;
  defaultName: string;
  onChange: (signature: { png: string; method: SignMethod } | null) => void;
}) {
  const [method, setMethod] = useState<SignMethod>(allowDrawn ? "DRAWN" : "TYPED");
  const [typed, setTyped] = useState(defaultName);
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [inked, setInked] = useState(false);

  const setup = useCallback(() => {
    const canvasElement = canvas.current;
    if (!canvasElement) return;
    const pixelRatio = Math.max(1, window.devicePixelRatio || 1);
    const width = canvasElement.clientWidth;
    canvasElement.width = Math.round(width * pixelRatio);
    canvasElement.height = Math.round(160 * pixelRatio);
    const context = canvasElement.getContext("2d")!;
    context.scale(pixelRatio, pixelRatio);
    context.lineWidth = 2.6;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.strokeStyle = "#0b1b3a";
    setInked(false);
  }, []);

  useEffect(() => {
    if (method !== "DRAWN") return;
    setup();
    onChange(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [method]);

  // Typed: render the name in the handwriting font on a canvas.
  useEffect(() => {
    if (method !== "TYPED") return;
    let stop = false;
    (async () => {
      const name = typed.trim();
      if (!name) return onChange(null);
      await document.fonts.load('700 64px "Caveat"').catch(() => {});
      if (stop) return;
      const canvasElement = document.createElement("canvas");
      const context = canvasElement.getContext("2d")!;
      context.font = '700 64px "Caveat", cursive';
      const width = Math.ceil(context.measureText(name).width) + 40;
      canvasElement.width = Math.min(Math.max(width, 200), 1400);
      canvasElement.height = 110;
      context.font = '700 64px "Caveat", cursive';
      context.fillStyle = "#0b1b3a";
      context.textBaseline = "middle";
      context.fillText(name, 20, 58, canvasElement.width - 40);
      onChange({ png: canvasElement.toDataURL("image/png"), method: "TYPED" });
    })();
    return () => {
      stop = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [method, typed]);

  const pointerPosition = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const finish = () => {
    if (!drawing.current) return;
    drawing.current = false;
    last.current = null;
    if (inked && canvas.current) onChange({ png: canvas.current.toDataURL("image/png"), method: "DRAWN" });
  };

  return (
    <div className="flex flex-col gap-3">
      {allowDrawn && allowTyped && (
        <Segmented
          label="How to sign"
          value={method}
          onChange={setMethod}
          items={[
            { value: "DRAWN", label: "Draw" },
            { value: "TYPED", label: "Type" },
          ]}
        />
      )}
      {method === "DRAWN" ? (
        <div className="flex flex-col gap-2">
          <div className="relative rounded-lg border-2 border-dashed border-input bg-white">
            <canvas
              ref={canvas}
              aria-label="Sign here"
              className="block h-40 w-full touch-none"
              onPointerDown={(event) => {
                event.currentTarget.setPointerCapture(event.pointerId);
                drawing.current = true;
                last.current = pointerPosition(event);
                const context = canvas.current!.getContext("2d")!;
                context.beginPath();
                context.arc(last.current.x, last.current.y, 1.2, 0, Math.PI * 2);
                context.fillStyle = "#0b1b3a";
                context.fill();
                setInked(true);
              }}
              onPointerMove={(event) => {
                if (!drawing.current || !last.current) return;
                const point = pointerPosition(event);
                const context = canvas.current!.getContext("2d")!;
                context.beginPath();
                context.moveTo(last.current.x, last.current.y);
                context.quadraticCurveTo(last.current.x, last.current.y, (last.current.x + point.x) / 2, (last.current.y + point.y) / 2);
                context.lineTo(point.x, point.y);
                context.stroke();
                last.current = point;
              }}
              onPointerUp={finish}
              onPointerCancel={finish}
              onPointerLeave={finish}
            />
            {!inked && <span className="pointer-events-none absolute inset-x-0 bottom-3 text-center text-sm text-muted-foreground">Sign here with your finger or mouse</span>}
            <span aria-hidden className="pointer-events-none absolute inset-x-6 bottom-10 border-b border-slate-300" />
          </div>
          <Button type="button" variant="ghost" size="sm" className="self-end" onClick={() => (setup(), onChange(null))}>
            Clear
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <Field label="Type your name to sign" value={typed} onChange={(event) => setTyped(event.target.value)} autoComplete="name" />
          <div className="flex min-h-24 items-center rounded-lg border bg-white px-4 text-5xl text-[#0b1b3a]" style={{ fontFamily: '"Caveat", cursive', fontWeight: 700 }}>
            {typed || <span className="text-base text-muted-foreground">Your signature appears here</span>}
          </div>
        </div>
      )}
    </div>
  );
}
