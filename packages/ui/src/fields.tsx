"use client";

// Labelled form fields. Labels sit above inputs (easier to read on narrow
// screens than side-by-side), hints and errors sit below.
import { useId, type InputHTMLAttributes, type SelectHTMLAttributes } from "react";
import { Input } from "./components/input";
import { Label } from "./components/label";
import { NativeSelect } from "./components/native-select";

interface FieldExtras {
  label: string;
  hint?: string;
  error?: string | null;
}

function Help({ id, hint, error }: { id: string; hint?: string; error?: string | null }) {
  if (error) return <p id={id} className="text-sm font-medium text-destructive">{error}</p>;
  if (hint) return <p id={id} className="text-sm text-muted-foreground">{hint}</p>;
  return null;
}

export function Field({ label, hint, error, id, ...props }: InputHTMLAttributes<HTMLInputElement> & FieldExtras) {
  const auto = useId();
  const inputId = id ?? auto;
  const helpId = `${inputId}-help`;
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={inputId}>{label}</Label>
      <Input id={inputId} aria-invalid={!!error || undefined} aria-describedby={hint || error ? helpId : undefined} {...props} />
      <Help id={helpId} hint={hint} error={error} />
    </div>
  );
}

export function SelectField({
  label,
  hint,
  error,
  id,
  options,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & FieldExtras & { options: { value: string; label: string }[] }) {
  const auto = useId();
  const selectId = id ?? auto;
  const helpId = `${selectId}-help`;
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={selectId}>{label}</Label>
      <NativeSelect id={selectId} options={options} aria-describedby={hint || error ? helpId : undefined} {...props} />
      <Help id={helpId} hint={hint} error={error} />
    </div>
  );
}
