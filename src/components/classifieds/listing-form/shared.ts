export const fieldClass =
  "mt-1.5 h-11 w-full rounded-md border border-input bg-background px-3 text-[13px] outline-none focus:border-foreground";
export const textareaClass =
  "mt-1.5 w-full rounded-md border border-input bg-background px-3 py-2.5 text-[13px] outline-none focus:border-foreground";

export function linesToList(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

export function listToLines(value: string[] | undefined): string {
  return (value ?? []).join("\n");
}
