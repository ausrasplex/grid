"use client";
import { Button, Icon } from "@grid/ui";

export function PrintButton() {
  return (
    <Button onClick={() => window.print()}>
      <Icon name="file" /> Print or save PDF
    </Button>
  );
}
