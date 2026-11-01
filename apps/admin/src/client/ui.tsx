import type { ComponentProps, ReactNode } from "react";

export function Field({
  label,
  ...input
}: { label: string; name: string } & ComponentProps<"input">) {
  return (
    <label className="grid gap-1.5">
      <span className="text-sm font-medium text-neutral-700">{label}</span>
      <input
        className="h-9 rounded-md border border-neutral-200 bg-white px-3 text-sm shadow-xs outline-none placeholder:text-neutral-400 focus-visible:border-neutral-400 focus-visible:ring-3 focus-visible:ring-neutral-200"
        {...input}
      />
    </label>
  );
}

const buttonLook = {
  primary: "h-9 px-4 bg-neutral-900 text-white hover:bg-neutral-800",
  outline:
    "h-8 px-3 border border-neutral-200 bg-white text-neutral-900 shadow-xs hover:bg-neutral-100",
};

export function Button({
  look,
  ...button
}: { look: keyof typeof buttonLook } & ComponentProps<"button">) {
  return (
    <button
      className={`inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:ring-3 focus-visible:ring-neutral-300 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 ${buttonLook[look]}`}
      {...button}
    />
  );
}

export function FormError({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="text-sm text-red-600">
      {children}
    </p>
  );
}
