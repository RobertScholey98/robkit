// The hub's controls. The screens draw everything but their layout through
// these, so a UI kit restyles the hub by replacing this file.
import type { ComponentProps, ReactNode } from "react";

export function Card({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/50 p-6 antialiased">
      <div className="w-full max-w-sm rounded-xl border bg-card p-6 text-card-foreground shadow-sm">
        <p className="text-sm text-muted-foreground">robkit hub</p>
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
      <span className="text-sm font-medium text-foreground">{label}</span>
      <input
        required
        className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        {...input}
      />
    </label>
  );
}

const buttonLook = {
  primary:
    "h-9 rounded-md px-4 bg-primary text-primary-foreground hover:bg-primary/80",
  outline: "h-9 rounded-md px-4 border bg-background shadow-xs hover:bg-muted",
  link: "text-muted-foreground underline-offset-4 hover:text-foreground hover:underline",
};

export function Button({
  look,
  ...button
}: { look: keyof typeof buttonLook } & ComponentProps<"button">) {
  return (
    <button
      className={`inline-flex items-center justify-center text-sm font-medium transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 ${buttonLook[look]}`}
      {...button}
    />
  );
}

export function FormError({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="text-sm text-destructive">
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
      className="flex items-center gap-3 rounded-xl border bg-card px-5 py-4 text-card-foreground shadow-xs transition-colors hover:bg-accent hover:text-accent-foreground"
    >
      {children}
    </a>
  );
}

export function InlineCode({ children }: { children: string }) {
  return (
    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
      {children}
    </code>
  );
}
