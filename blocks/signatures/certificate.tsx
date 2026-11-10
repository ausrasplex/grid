// The signing certificate: the last page of every signed PDF. Plain HTML
// for the document renderer (inside DocShell, so it shares its styles).
import type { CertificateInfo } from "./service";

const LABEL: Record<string, string> = {
  VIEWED: "Opened the link",
  CODE_SENT: "Code emailed",
  CODE_FAILED: "Wrong code entered",
  CODE_VERIFIED: "Code confirmed",
  OPTIONS_CHANGED: "Changed options",
  CONSENTED: "Agreed to sign electronically and to the terms",
  SIGNED: "Signed",
};

const stamp = (date: Date) =>
  new Date(date).toLocaleString("en-AU", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit", timeZoneName: "short" });

function device(userAgent: string | null) {
  if (!userAgent) return "";
  const os = /iPhone|iPad/.test(userAgent) ? "iOS" : /Android/.test(userAgent) ? "Android" : /Windows/.test(userAgent) ? "Windows" : /Mac OS X/.test(userAgent) ? "macOS" : /Linux/.test(userAgent) ? "Linux" : "";
  const browser = /Edg\//.test(userAgent) ? "Edge" : /Chrome\//.test(userAgent) ? "Chrome" : /Firefox\//.test(userAgent) ? "Firefox" : /Safari\//.test(userAgent) ? "Safari" : "";
  return [browser, os].filter(Boolean).join(" on ");
}

export function SigningCertificate({ certificate }: { certificate: CertificateInfo }) {
  return (
    <section style={{ breakBefore: "page" }}>
      <h2 style={{ marginTop: 0 }}>Signing certificate</h2>
      <p className="small muted">
        This page records how {certificate.docLabel} was signed online. The whole PDF is digitally sealed: PDF readers show it as signed, and any change made after signing breaks the seal.
      </p>
      <table className="avoid" style={{ marginTop: 8 }}>
        <tbody>
          <tr><td className="muted" style={{ width: "32%" }}>Document</td><td>{certificate.docLabel}</td></tr>
          <tr><td className="muted">Signed by</td><td>{[certificate.signerName, certificate.signerTitle, certificate.signerCompany].filter(Boolean).join(", ")}</td></tr>
          <tr><td className="muted">Signed on</td><td>{stamp(certificate.signedAt)}</td></tr>
          <tr><td className="muted">Identity check</td><td>One-time code sent to {certificate.verifiedEmail} and entered correctly</td></tr>
          <tr><td className="muted">Signature</td><td>{certificate.method === "DRAWN" ? "Drawn on screen" : "Name typed and adopted as signature"}</td></tr>
          <tr><td className="muted">Document shown (SHA-256)</td><td className="small" style={{ wordBreak: "break-all" }}>{certificate.docSha256}</td></tr>
          <tr><td className="muted">Sealed with</td><td className="small" style={{ wordBreak: "break-all" }}>{certificate.seal.subject} · SHA-256 {certificate.seal.fingerprint}</td></tr>
        </tbody>
      </table>
      <h2>What happened</h2>
      <table className="small">
        <thead>
          <tr><th>When</th><th>What</th><th>From</th></tr>
        </thead>
        <tbody>
          {certificate.events.map((event, index) => (
            <tr key={index} className="avoid">
              <td style={{ whiteSpace: "nowrap" }}>{stamp(event.at)}</td>
              <td>{LABEL[event.type] ?? event.type}</td>
              <td>{[event.ip, device(event.userAgent)].filter(Boolean).join(" · ")}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="box avoid" style={{ marginTop: 16 }}>
        <div style={{ fontWeight: 700 }}>Check this document</div>
        <div className="small">
          Verify code <strong>{certificate.verifyCode}</strong> at {certificate.verifyUrl}. Upload this PDF there to confirm it is the copy that was signed.
        </div>
      </div>
    </section>
  );
}
