// The hub's controls, drawn with the install's UI kit, Chakra, in
// packages/ui. The screens draw everything but their layout through these.
import {
  Card as KitCard,
  Code,
  Field as KitField,
  Button as KitButton,
  Heading as KitHeading,
  Input,
  Provider,
  Text,
} from "@internal/ui";
import type { ComponentProps, ReactNode } from "react";

/** Gives the page Chakra's theme. */
export function Root({ children }: { children: ReactNode }) {
  return <Provider>{children}</Provider>;
}

export function Card({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/50 p-6 antialiased">
      <KitCard.Root width="full" maxWidth="sm" rounded="xl">
        <KitCard.Body>
          <Text textStyle="sm" color="fg.muted">
            robkit hub
          </Text>
          {children}
        </KitCard.Body>
      </KitCard.Root>
    </main>
  );
}

export function Heading({ children }: { children: ReactNode }) {
  return (
    <KitHeading as="h1" size="lg" mt="1" letterSpacing="tight">
      {children}
    </KitHeading>
  );
}

export function Field({
  label,
  size,
  ...input
}: { label: string; name: string } & ComponentProps<"input">) {
  return (
    <KitField.Root gap="1.5">
      <KitField.Label>{label}</KitField.Label>
      <Input required size="sm" htmlSize={size} {...input} />
    </KitField.Root>
  );
}

const buttonLook = {
  primary: { variant: "solid", size: "sm" },
  outline: { variant: "outline", size: "sm" },
  link: {
    variant: "plain",
    size: "sm",
    px: "0",
    height: "auto",
    color: "fg.muted",
    _hover: { color: "fg", textDecoration: "underline" },
  },
} as const;

export function Button({
  look,
  type = "button",
  ...button
}: { look: keyof typeof buttonLook } & Omit<
  ComponentProps<"button">,
  "className" | "color"
>) {
  return <KitButton type={type} {...buttonLook[look]} {...button} />;
}

export function FormError({ children }: { children: ReactNode }) {
  return (
    <Text role="alert" textStyle="sm" color="fg.error">
      {children}
    </Text>
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
    <KitCard.Root
      asChild
      flexDirection="row"
      alignItems="center"
      gap="3"
      px="5"
      py="4"
      rounded="xl"
      transition="colors"
      focusVisibleRing="outside"
      _hover={{ bg: "bg.emphasized" }}
    >
      <a href={href}>{children}</a>
    </KitCard.Root>
  );
}

export function InlineCode({ children }: { children: string }) {
  return <Code size="sm">{children}</Code>;
}
