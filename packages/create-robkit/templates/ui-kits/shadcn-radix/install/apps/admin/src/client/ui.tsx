// Admin's controls, drawn with the install's UI kit in packages/ui. The
// screens draw everything but their layout through these.
import { Badge as KitBadge } from "@internal/ui/components/ui/badge";
import { Button as KitButton } from "@internal/ui/components/ui/button";
import { Card as KitCard, CardContent } from "@internal/ui/components/ui/card";
import { Checkbox } from "@internal/ui/components/ui/checkbox";
import { Input } from "@internal/ui/components/ui/input";
import { Label } from "@internal/ui/components/ui/label";
import {
  RadioGroup,
  RadioGroupItem,
} from "@internal/ui/components/ui/radio-group";
import {
  Table as KitTable,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@internal/ui/components/ui/table";
import { useId, type ComponentProps, type ReactNode } from "react";

export function Field({
  label,
  ...input
}: { label: string; name: string } & ComponentProps<"input">) {
  const id = useId();
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} className="h-9" {...input} />
    </div>
  );
}

const buttonLook = {
  primary: { variant: "default", size: "lg" },
  outline: { variant: "outline", size: "default" },
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

/** A raised surface holding one form or one item. */
export function Panel({ children }: { children: ReactNode }) {
  return (
    <KitCard>
      <CardContent className="grid gap-4">{children}</CardContent>
    </KitCard>
  );
}

export function Table({
  head,
  children,
}: {
  head: readonly ReactNode[];
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl border bg-card px-2">
      <KitTable>
        <TableHeader>
          <TableRow>
            {head.map((heading, column) => (
              <TableHead key={column} className="text-muted-foreground">
                {heading}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>{children}</TableBody>
      </KitTable>
    </div>
  );
}

export function Row({ children }: { children: ReactNode }) {
  return <TableRow>{children}</TableRow>;
}

export function Cell({
  look = "plain",
  children,
}: {
  look?: "plain" | "strong" | "code" | "end";
  children?: ReactNode;
}) {
  const className = {
    plain: "",
    strong: "font-medium",
    code: "font-mono",
    end: "text-right",
  }[look];
  return <TableCell className={className}>{children}</TableCell>;
}

const badgeLook = {
  primary: "default",
  secondary: "secondary",
  destructive: "destructive",
  outline: "outline",
} as const;

export function Badge({
  look,
  children,
}: {
  look: keyof typeof badgeLook;
  children: string;
}) {
  return <KitBadge variant={badgeLook[look]}>{children}</KitBadge>;
}

/** A checkbox with its label beside it. */
export function Check({
  checked,
  onCheckedChange,
  children,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  children: ReactNode;
}) {
  return (
    <Label className="font-normal">
      <Checkbox
        checked={checked}
        onCheckedChange={(next) => {
          // Radix also reports "indeterminate", which these never show.
          onCheckedChange(next === true);
        }}
      />
      {children}
    </Label>
  );
}

/** One choice from a few, as radio buttons in a row. */
export function Choices<Value extends string>({
  legend,
  name,
  value,
  options,
  onValueChange,
}: {
  legend: string;
  /** Names the group's inputs, unique on the page. */
  name: string;
  value: Value;
  options: readonly { value: Value; label: string }[];
  onValueChange: (value: Value) => void;
}) {
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-1 text-sm font-medium">{legend}</legend>
      <RadioGroup
        name={name}
        value={value}
        onValueChange={(next) => {
          const option = options.find((candidate) => candidate.value === next);
          if (option) onValueChange(option.value);
        }}
        className="flex flex-wrap gap-4"
      >
        {options.map((option) => (
          <Label key={option.value} className="font-normal">
            <RadioGroupItem value={option.value} />
            {option.label}
          </Label>
        ))}
      </RadioGroup>
    </fieldset>
  );
}

/**
 * Wraps the whole page, for a kit that needs setting up first. These
 * controls need none.
 */
export function Root({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
