import type { ComponentProps, ReactNode } from "react";

export function Card({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-50 p-6 font-sans text-neutral-950 antialiased">
      <div className="w-full max-w-sm rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
        <p className="text-sm text-neutral-500">robkit hub</p>
        {children}
      </div>
    </main>
  );
}

export function Heading({ children }: { children: ReactNode }) {
  return (
    <h1 className="mt-1 text-lg font-semibold tracking-tight">{children}</h1>
  );
}

export function Field({
  label,
  ...input
}: { label: string; name: string } & ComponentProps<"input">) {
  return (
    <label className="grid gap-1.5">
      <span className="text-sm font-medium text-neutral-700">{label}</span>
      <input
        required
        className="h-9 rounded-md border border-neutral-200 bg-white px-3 text-sm shadow-xs outline-none placeholder:text-neutral-400 focus-visible:border-neutral-400 focus-visible:ring-3 focus-visible:ring-neutral-200"
        {...input}
      />
    </label>
  );
}

const buttonLook = {
  primary: "bg-neutral-900 text-white hover:bg-neutral-800",
  outline:
    "border border-neutral-200 bg-white text-neutral-900 shadow-xs hover:bg-neutral-100",
};

export function Button({
  look,
  ...button
}: { look: keyof typeof buttonLook } & ComponentProps<"button">) {
  return (
    <button
      className={`inline-flex h-9 items-center justify-center rounded-md px-4 text-sm font-medium transition-colors focus-visible:ring-3 focus-visible:ring-neutral-300 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 ${buttonLook[look]}`}
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
