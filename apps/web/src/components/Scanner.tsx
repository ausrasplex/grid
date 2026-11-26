"use client";

// The one scanner (docs/navigation.md §7a): the back camera reads a QR code
// or barcode and Grid opens what it is (/api/scan). Uses the phone's own
// barcode reader where there is one (Android Chrome), and ZXing where
// there isn't (iPhone). The camera only works on a secure (https) address;
// "Type it instead" always works.
import { useEffect, useRef, useState } from "react";
import { Keyboard, Loader2, RotateCcw, ScanLine } from "lucide-react";
import { Alert, Button, Field, FormActions } from "@grid/ui";

type State = { kind: "starting" } | { kind: "scanning" } | { kind: "looking"; text: string } | { kind: "unknown"; text: string } | { kind: "no-camera"; reason: string };

interface Detector {
  detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]>;
}
type DetectorClass = { new (options: { formats: string[] }): Detector; getSupportedFormats(): Promise<string[]> };

const WANTED = ["qr_code", "code_128", "code_39", "ean_13", "ean_8", "upc_a", "upc_e", "data_matrix", "itf"];

async function lookUp(text: string): Promise<string | null> {
  const response = await fetch(`/api/scan?${new URLSearchParams({ text })}`, { credentials: "same-origin" });
  if (!response.ok) return null;
  return ((await response.json()) as { href: string | null }).href;
}

export function Scanner({ hint }: { hint: string }) {
  const video = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<State>({ kind: "starting" });
  const [typing, setTyping] = useState(false);
  const [typed, setTyped] = useState("");
  const [attempt, setAttempt] = useState(0);
  const done = useRef(false);

  const found = async (text: string) => {
    if (done.current) return;
    done.current = true;
    setState({ kind: "looking", text });
    const href = await lookUp(text).catch(() => null);
    if (href) window.location.href = href;
    else setState({ kind: "unknown", text });
  };

  useEffect(() => {
    if (typing) return;
    done.current = false;
    let stream: MediaStream | null = null;
    let stopped = false;
    let stopZxing: (() => void) | null = null;

    (async () => {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        return setState({ kind: "no-camera", reason: "The camera only works when Grid is opened on a secure (https) address. Type the code instead, or point the phone's own camera app at the tag: it opens the link." });
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      } catch {
        return setState({ kind: "no-camera", reason: "Grid can't use the camera. Allow camera access for this site in the browser's settings, or type the code instead." });
      }
      if (stopped || !video.current) return;
      video.current.srcObject = stream;
      await video.current.play().catch(() => {});
      setState({ kind: "scanning" });

      const Native = (window as unknown as { BarcodeDetector?: DetectorClass }).BarcodeDetector;
      if (Native) {
        const supported = await Native.getSupportedFormats().catch(() => [] as string[]);
        const detector = new Native({ formats: WANTED.filter((format) => supported.includes(format)) });
        const tick = async () => {
          if (stopped || done.current || !video.current) return;
          const codes = await detector.detect(video.current).catch(() => []);
          if (codes[0]?.rawValue) return void found(codes[0].rawValue);
          setTimeout(() => void tick(), 150);
        };
        void tick();
        return;
      }
      const { BrowserMultiFormatReader } = await import("@zxing/browser");
      if (stopped || !video.current) return;
      const controls = await new BrowserMultiFormatReader().decodeFromVideoElement(video.current, (result) => {
        if (result) void found(result.getText());
      });
      stopZxing = () => controls.stop();
    })();

    return () => {
      stopped = true;
      stopZxing?.();
      stream?.getTracks().forEach((track) => track.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typing, attempt]);

  if (typing) {
    return (
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          done.current = false;
          void found(typed.trim());
        }}
      >
        <Field label="Code or barcode" placeholder="e.g. 92MF-4TD8, or the number under a barcode" value={typed} onChange={(event) => setTyped(event.target.value)} autoFocus autoCapitalize="characters" autoComplete="off" />
        {state.kind === "unknown" && <Alert variant="error">Not recognised: {state.text}. Check the code, or it may belong to another business.</Alert>}
        <FormActions>
          <Button type="button" variant="outline" onClick={() => (setTyping(false), setState({ kind: "starting" }))}>
            <ScanLine /> Use the camera
          </Button>
          <Button type="submit" size="lg" disabled={!typed.trim() || state.kind === "looking"}>
            {state.kind === "looking" ? "Looking…" : "Open"}
          </Button>
        </FormActions>
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {state.kind === "no-camera" ? (
        <Alert>{state.reason}</Alert>
      ) : (
        <div className="paper relative mx-auto aspect-square w-full max-w-md overflow-hidden rounded-2xl bg-black">
          <video ref={video} playsInline muted className="size-full object-cover" />
          <div aria-hidden className="pointer-events-none absolute inset-[15%] rounded-xl border-4 border-primary/80" />
          {(state.kind === "starting" || state.kind === "looking") && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40">
              <Loader2 className="size-8 animate-spin text-white" />
            </div>
          )}
        </div>
      )}
      {state.kind === "scanning" && <p className="text-center text-muted-foreground">{hint}</p>}
      {state.kind === "unknown" && (
        <Alert variant="error">
          Not recognised: <span className="font-mono break-all">{state.text}</span>. It may be another business&apos;s, or a product barcode Grid doesn&apos;t know yet.
        </Alert>
      )}
      <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
        {state.kind === "unknown" && (
          <Button size="lg" onClick={() => (setState({ kind: "starting" }), setAttempt(attempt + 1))}>
            <RotateCcw /> Scan again
          </Button>
        )}
        <Button variant="outline" size="lg" onClick={() => (setTyping(true), setState({ kind: "starting" }))}>
          <Keyboard /> Type it instead
        </Button>
      </div>
    </div>
  );
}
