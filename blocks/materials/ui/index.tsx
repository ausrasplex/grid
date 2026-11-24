// Materials pages (docs/materials-block.md §1).
//   /materials        the list: search, trades, brands, add (Settings › Materials)
//   /materials/<id>   one material: its picture and details, and the rest of its family

import { can, notFound, type RequestContext } from "@grid/core";
import { Alert, List, PageHeader, Section, Stack, type BlockPages } from "@grid/ui";
import { listBrands, listMaterials, materialPage } from "../service";
import { tradeName } from "../trades";
import { materialMeta } from "../words";
import { MaterialActions } from "./MaterialActions";
import { Materials } from "./Materials";
import { MaterialPicture, photoUrl } from "./shared";

export const pages: BlockPages = {
  "": async ({ ctx, params: [first] }) => {
    if (!can(ctx, "materials.view")) throw notFound("Page not found");
    if (first) return <MaterialPage ctx={ctx} materialId={first} />;
    const [materials, brands] = await Promise.all([listMaterials(ctx), listBrands(ctx)]);
    return <Materials initial={materials} initialBrands={brands} canManage={can(ctx, "materials.manage")} />;
  },
};

async function MaterialPage({ ctx, materialId }: { ctx: RequestContext; materialId: string }) {
  const { material, family } = await materialPage(ctx, materialId);
  const details: { label: string; value: string | null; href?: string }[] = [
    { label: "Item type", value: material.itemType },
    { label: "Brand", value: material.brand },
    { label: "Model", value: material.model },
    { label: "Colour / finish", value: material.finish },
    { label: "Size", value: material.size },
    { label: "Family", value: material.family },
    { label: "Trade", value: tradeName(material.trade) },
    { label: "Link", value: material.link, href: material.link ?? undefined },
    { label: "Notes", value: material.notes },
  ];

  return (
    <>
      <PageHeader
        title={material.name}
        meta={[material.itemType, materialMeta(material)].filter(Boolean).join(" · ") || undefined}
        actions={!material.removed && can(ctx, "materials.manage") ? <MaterialActions material={material} /> : undefined}
      />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <Stack>
          {material.removed && <Alert>This material was removed from the list. Price book items and jobs that use it keep it.</Alert>}
          <Section title="Details" flush>
            <dl className="divide-y">
              {details
                .filter((detail) => detail.value)
                .map((detail) => (
                  <div key={detail.label} className="flex flex-col gap-0.5 px-4 py-3 sm:flex-row sm:gap-4 sm:px-5">
                    <dt className="w-32 shrink-0 text-sm text-muted-foreground">{detail.label}</dt>
                    <dd className="min-w-0 font-medium break-words whitespace-pre-line">
                      {detail.href ? (
                        <a href={detail.href} target="_blank" rel="noreferrer" className="text-primary underline-offset-4 hover:underline">
                          {detail.value}
                        </a>
                      ) : (
                        detail.value
                      )}
                    </dd>
                  </div>
                ))}
            </dl>
          </Section>
          {material.family && (
            <Section title="Other finishes" description={`The rest of the ${material.family} family.`} flush>
              {family.length === 0 ? (
                <p className="px-4 pb-4 text-muted-foreground sm:px-5">None yet. Give another material the family &ldquo;{material.family}&rdquo; to link it here.</p>
              ) : (
                <List>
                  {family.map((other) => (
                    <li key={other.id}>
                      <a href={`/materials/${other.id}`} className="flex min-h-touch-lg items-center gap-3 px-4 py-2.5 hover:bg-muted active:bg-muted sm:px-5">
                        <MaterialPicture material={other} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-semibold">{other.finish ?? other.name}</span>
                          <span className="block truncate text-sm text-muted-foreground">{materialMeta({ ...other, finish: null }) || other.name}</span>
                        </span>
                      </a>
                    </li>
                  ))}
                </List>
              )}
            </Section>
          )}
        </Stack>
        <Stack>
          <Section title="Picture" flush>
            <div className="px-4 pb-4 sm:px-5">
              {material.photoFileId ? (
                <img src={photoUrl(material.photoFileId)} alt={material.name} className="w-full rounded-lg object-contain" />
              ) : material.swatch ? (
                // The business's own colour, shown as is.
                <div className="flex items-center gap-3">
                  <span aria-hidden className="block size-24 rounded-lg" style={{ backgroundColor: material.swatch }} />
                  <span className="font-mono text-muted-foreground">{material.swatch}</span>
                </div>
              ) : (
                <p className="text-muted-foreground">No photo yet.</p>
              )}
            </div>
          </Section>
        </Stack>
      </div>
    </>
  );
}
