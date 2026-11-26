"use client";

// The Settings page's lists, with a pin on each row: pinned pages show in
// the menu (the desktop sidebar, More on phones and tablets), saved to the
// person's account (User.settings.pinned). docs/navigation.md §5.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, Pin } from "lucide-react";
import { Alert, Grid, Icon, Section, api, cn, useAction } from "@grid/ui";
import type { SettingsSection } from "@/components/AppShell";

export function SettingsSections({ sections, pinned: initial }: { sections: SettingsSection[]; pinned: string[] }) {
  const router = useRouter();
  const action = useAction();
  const [pinned, setPinned] = useState(initial);

  const toggle = (id: string) => {
    const before = pinned;
    const next = pinned.includes(id) ? pinned.filter((entry) => entry !== id) : [...pinned, id];
    setPinned(next); // straight away; put back if saving fails
    void action.run(async () => {
      try {
        await api("/users/me", { method: "PATCH", body: { settings: { pinned: next } } });
        router.refresh(); // the menu picks it up
      } catch (error) {
        setPinned(before);
        throw error;
      }
    });
  };

  return (
    <>
      {action.error && (
        <div className="mb-4">
          <Alert variant="error">{action.error}</Alert>
        </div>
      )}
      <Grid>
        {sections.map((section) => (
          <Section key={section.id} title={section.title} description={section.description} flush>
            <ul data-variant="buttons" className="flex flex-col gap-2 px-3 pb-3 sm:px-4 sm:pb-4">
              {section.items.map((item) => (
                <SettingsRow key={item.id} item={item} pinned={pinned.includes(item.id)} onPin={() => toggle(item.id)} />
              ))}
            </ul>
          </Section>
        ))}
      </Grid>
    </>
  );
}

const HOVER = "hover:bg-[color-mix(in_srgb,var(--foreground)_7%,var(--muted))] active:bg-[color-mix(in_srgb,var(--foreground)_10%,var(--muted))]";

/** One option as a rounded button (Settings › List variant="buttons"), with its pin on the right. */
function SettingsRow({ item, pinned, onPin }: { item: SettingsSection["items"][number]; pinned: boolean; onPin: () => void }) {
  return (
    <li className="relative">
      <a href={item.href} className={cn("flex min-h-touch-lg items-center gap-3 rounded-lg bg-muted py-3 pr-24 pl-3 transition-colors sm:pl-4", HOVER)}>
        {item.icon && (
          <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground [&_svg]:size-5">
            <Icon name={item.icon} />
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block font-medium">{item.label}</span>
          {item.description && <span className="block truncate text-sm text-muted-foreground">{item.description}</span>}
        </span>
      </a>
      {/* Its own button, beside the link rather than inside it. */}
      <div className="pointer-events-none absolute inset-y-0 right-2 flex items-center gap-1">
        <button
          type="button"
          onClick={onPin}
          aria-pressed={pinned}
          aria-label={pinned ? `Remove ${item.label} from the menu` : `Add ${item.label} to the menu`}
          title={pinned ? "Remove from the menu" : "Add to the menu"}
          className={cn(
            "pointer-events-auto flex size-touch items-center justify-center rounded-full transition-colors hover:bg-background/70 [&_svg]:size-[18px]",
            pinned ? "text-primary" : "text-muted-foreground",
          )}
        >
          <Pin aria-hidden className={pinned ? "fill-current" : undefined} />
        </button>
        <ChevronRight aria-hidden className="size-5 text-muted-foreground" />
      </div>
    </li>
  );
}
