import { PageHeader, Section } from "@grid/ui";
import { Scanner } from "@/components/Scanner";

// The Scan button (phone bar, tablet rail, the scan buttons in search bars)
// lands here: the one scanner for Grid's QR codes (jobs, sites, plan
// sheets, quotes, asset tags) and asset barcodes (docs/navigation.md §7a).
// ?for=assets comes from the Assets list, to word the hint for tags.
export const metadata = { title: "Scan · Grid" };

export default async function ScanPage({ searchParams }: { searchParams: Promise<{ for?: string }> }) {
  const { for: from } = await searchParams;
  const hint = from === "assets" ? "Point the camera at an asset's QR tag or barcode." : "Point the camera at a QR code: a site, a job, a plan sheet or an asset tag.";
  return (
    <>
      <PageHeader title="Scan" meta="QR codes · asset tags · barcodes" />
      <Section>
        <Scanner hint={hint} />
      </Section>
    </>
  );
}
