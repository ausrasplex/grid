// A sample document, so the Branding page can show what a PDF looks like.
import { DocShell } from "./document";
import type { Theme } from "./service";

export function SampleDocument({ theme }: { theme: Theme }) {
  return (
    <DocShell theme={theme} title="Sample" meta={[["No.", "Q-1001"], ["Date", new Date().toLocaleDateString("en-AU")]]} businessLines={["ABN 12 345 678 901"]} watermark="SAMPLE">
      <div className="two">
        <div className="box">
          <div className="muted small">For</div>
          <strong>Mrs Nguyen</strong>
          <div>12 Smith Street, Brunswick VIC 3056</div>
        </div>
        <div className="box">
          <div className="muted small">Job</div>
          <strong>Switchboard upgrade</strong>
        </div>
      </div>
      <h2>Work</h2>
      <table>
        <thead>
          <tr><th>Description</th><th className="num">Qty</th><th className="num">Price</th><th className="num">Amount</th></tr>
        </thead>
        <tbody>
          <tr><td>Replace switchboard with RCBO board</td><td className="num">1</td><td className="num">$1,450.00</td><td className="num">$1,450.00</td></tr>
          <tr><td>Labour</td><td className="num">6 hr</td><td className="num">$95.00</td><td className="num">$570.00</td></tr>
        </tbody>
      </table>
      <table className="totals">
        <tbody>
          <tr><td>Subtotal</td><td className="num">$2,020.00</td></tr>
          <tr><td>GST (10%)</td><td className="num">$202.00</td></tr>
          <tr className="grand"><td>Total</td><td className="num">$2,222.00</td></tr>
        </tbody>
      </table>
    </DocShell>
  );
}
