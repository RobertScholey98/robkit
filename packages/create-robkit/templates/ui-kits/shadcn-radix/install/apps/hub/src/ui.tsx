// The hub's controls, drawn with the install's UI kit in packages/ui. The
// screens draw everything but their layout through these.
import { Button as KitButton } from "@internal/ui/components/ui/button";
import { Card as KitCard, CardContent } from "@internal/ui/components/ui/card";
import { Input } from "@internal/ui/components/ui/input";
import { Label } from "@internal/ui/components/ui/label";
import { useId, type ComponentProps, type ReactNode } from "react";

export function Card({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/50 p-6 antialiased">
      <KitCard className="w-full max-w-sm">
        <CardContent>
          <p className="text-sm text-muted-foreground">robkit hub</p>
          {children}
        </CardContent>
      </KitCard>
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
  const id = useId();
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} required className="h-9" {...input} />
    </div>
  );
}

const buttonLook = {
  primary: { variant: "default", size: "lg", className: "" },
  outline: { variant: "outline", size: "lg", className: "" },
  link: {
    variant: "link",
    size: "sm",
    className: "h-auto px-0 text-muted-foreground hover:text-foreground",
  },
} as const;

export function Button({
  look,
  type = "button",
  ...button
}: { look: keyof typeof buttonLook } & Omit<
  ComponentProps<"button">,
  "className"
>) {
  return <KitButton type={type} {...buttonLook[look]} {...button} />;
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
      className="block rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <KitCard
        size="sm"
        className="flex-row items-center gap-3 px-4 transition-colors hover:bg-accent hover:text-accent-foreground"
      >
        {children}
      </KitCard>
    </a>
  );
}

export function InlineCode({ children }: { children: string }) {
  return (
    <code className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs">
      {children}
    </code>
  );
}

/**
 * Wraps the whole page, for a kit that needs setting up first. These
 * controls need none.
 */
export function Root({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
