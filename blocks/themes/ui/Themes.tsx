"use client";

// Settings › Themes (/themes): the themes you've made, and your business's.
import { useRef } from "react";
import { useRouter } from "next/navigation";
import { Check, Palette, Plus, Upload } from "lucide-react";
import { ActionButton, Alert, Badge, Button, EmptyState, Loading, PageHeader, Section, Stack, useAction, useApi } from "@grid/ui";
import { Swatches, importThemeFile, useUseTheme, type ThemeJson, type ThemeList } from "./shared";

export function Themes({ companyName }: { companyName: string | null }) {
  const router = useRouter();
  const { data, error, loading, reload } = useApi<ThemeList>("/themes");
  const picker = useRef<HTMLInputElement>(null);
  const importing = useAction();
  const chooser = useUseTheme();
  const importScope = useRef<"mine" | "business">("mine");

  const startImport = (scope: "mine" | "business") => {
    importScope.current = scope;
    picker.current?.click();
  };

  if (loading && !data) return <Loading />;
  if (error || !data) return <Alert variant="error">{error ?? "Couldn't load your themes"}</Alert>;

  // A business theme section is for teams; a sole trader sees it once there's something in it.
  const showBusiness = !data.solo || data.business.length > 0;
  const businessName = companyName ?? "Business";

  const rows = (themes: ThemeJson[]) => (
    <ul className="divide-y">
      {themes.map((theme) => {
        const inUse = data.current === `custom:${theme.id}`;
        return (
          <li key={theme.id} className="flex min-h-touch-lg items-center gap-3 px-4 py-2.5 sm:px-5">
            <a href={`/themes/${theme.id}`} className="flex min-w-0 flex-1 items-center gap-3 rounded-md py-1 hover:opacity-90">
              <Swatches theme={theme} />
              <span className="min-w-0">
                <span className="flex items-center gap-2">
                  <span className="truncate font-semibold">{theme.name}</span>
                  {inUse && <Badge variant="success">In use</Badge>}
                </span>
                <span className="block truncate text-sm text-muted-foreground">
                  {theme.look === "soft" ? "Soft shapes" : "Grid shapes"}
                  {theme.description ? ` · ${theme.description}` : ""}
                </span>
              </span>
            </a>
            {inUse ? (
              <span className="flex h-touch items-center gap-1.5 px-2 text-sm font-semibold text-muted-foreground">
                <Check className="size-4" aria-hidden /> Using
              </span>
            ) : (
              <Button variant="outline" disabled={chooser.busy} onClick={async () => (await chooser.use(theme)) && reload()}>
                Use
              </Button>
            )}
          </li>
        );
      })}
    </ul>
  );

  return (
    <>
      <PageHeader
        title="Themes"
        subtitle="Make Grid your own colours. Pick the one you're using in Profile › Appearance, or tap Use."
        actions={
          <>
            <ActionButton variant="outline" icon={<Upload />} label="Import" disabled={importing.busy} onClick={() => startImport("mine")} />
            <ActionButton icon={<Plus />} label="New theme" onClick={() => router.push("/themes/new")} />
          </>
        }
      />
      <Stack>
        <Alert variant="error">{importing.error ?? chooser.error}</Alert>
        <Section title="Your themes" description="Only you see these, in every business you work in." flush>
          {data.mine.length ? (
            rows(data.mine)
          ) : (
            <EmptyState title="No themes yet">
              <p>Start from Grid or Soft and pick your own page, card, text and button colours.</p>
              <Button className="mt-3" onClick={() => router.push("/themes/new")}>
                <Palette /> Make a theme
              </Button>
            </EmptyState>
          )}
        </Section>

        {showBusiness && (
          <Section
            title={`${businessName} themes`}
            description={data.canManageBusiness ? "Everyone in the business can pick these. Only you and other Owners can change them." : "Made by the business. Anyone in it can pick these."}
            actions={
              data.canManageBusiness ? (
                <Button variant="ghost" size="sm" disabled={importing.busy} onClick={() => startImport("business")}>
                  <Upload /> Import
                </Button>
              ) : undefined
            }
            flush
          >
            {data.business.length ? (
              rows(data.business)
            ) : (
              <EmptyState title="No business themes">
                {data.canManageBusiness ? (
                  <>
                    <p>Make one in your business colours for the whole team, or share one of yours.</p>
                    <Button className="mt-3" variant="outline" onClick={() => router.push("/themes/new?for=business")}>
                      <Plus /> Make a business theme
                    </Button>
                  </>
                ) : (
                  <p>Your Owner hasn&apos;t made one yet.</p>
                )}
              </EmptyState>
            )}
          </Section>
        )}
      </Stack>

      <input
        ref={picker}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          void importing.run(async () => {
            const theme = await importThemeFile(file, importScope.current);
            router.push(`/themes/${theme.id}`);
          });
        }}
      />
    </>
  );
}
