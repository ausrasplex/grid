import { EmptyState, PageHeader, Section } from "@grid/ui";

// The Scan button (phone bar, tablet rail) lands here. The one scanner for
// site QR codes, asset tags and product labels arrives with stage 2
// (docs/navigation.md §7a); until then this explains what it will do.
export default function ScanPage() {
  return (
    <>
      <PageHeader title="Scan" meta="Site QR codes · asset tags · product labels" />
      <Section flush>
        <EmptyState title="The scanner arrives in stage 2">
          Point your camera at a site QR code to ask for access, an asset tag to check it out, or a product label to open its manuals.
        </EmptyState>
      </Section>
    </>
  );
}
