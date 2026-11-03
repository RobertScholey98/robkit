// The hub's controls. The screens draw everything but their layout through
// these, so a UI kit restyles the hub by replacing this file.
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
  primary: "h-9 rounded-md px-4 bg-neutral-900 text-white hover:bg-neutral-800",
  outline:
    "h-9 rounded-md px-4 border border-neutral-200 bg-white text-neutral-900 shadow-xs hover:bg-neutral-100",
  link: "text-neutral-500 underline-offset-4 hover:text-neutral-900 hover:underline",
};

export function Button({
  look,
  ...button
}: { look: keyof typeof buttonLook } & ComponentProps<"button">) {
  return (
    <button
      className={`inline-flex items-center justify-center text-sm font-medium transition-colors focus-visible:ring-3 focus-visible:ring-neutral-300 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 ${buttonLook[look]}`}
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

/** An app on the launcher, as a link that fills its tile. */
export function Tile({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      className="flex items-center gap-3 rounded-xl border border-neutral-200 bg-white px-5 py-4 shadow-xs transition-colors hover:border-neutral-300 hover:bg-neutral-50"
    >
      {children}
    </a>
  );
}

export function InlineCode({ children }: { children: string }) {
  return (
    <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-xs text-neutral-700">
      {children}
    </code>
  );
}
