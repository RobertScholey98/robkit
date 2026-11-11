// The screenshots `pnpm screenshots` takes from a real install, by name:
// where each was taken and what it shows. A test holds this list to the
// files in src/screenshots.

/** Where `pnpm screenshots` keeps them, from the repo's root. */
export const screenshotsDir = "site/src/screenshots";

export interface Screenshot {
  /** The address the picture was taken at, as the frame's bar shows it. */
  address: string;
  /** What the picture shows, for a reader who can't see it. */
  alt: string;
}

export const screenshots = {
  "hub-set-up": {
    address: "hub.robkit.localhost:3000",
    alt: "The hub of a new install, headed Set up this install, which says whoever sets it up becomes its owner. It asks for a username, a password and the password again, with a Create owner button.",
  },
  "hub-sign-in": {
    address: "hub.robkit.localhost:3000",
    alt: "The hub's sign-in: an Access code field for a guest, a Sign in button, and an I'm the owner link below them.",
  },
  "hub-first-launcher": {
    address: "hub.robkit.localhost:3000",
    alt: "The hub just after you set up the install, signed in as robin, with one app in the launcher: example.",
  },
  "hub-launcher": {
    address: "hub.robkit.localhost:3000",
    alt: "The hub's launcher, signed in as the owner, robin, with four apps: example, notes, photos and recipes, each with its emoji.",
  },
  app: {
    address: "example.robkit.localhost:3000",
    alt: "The example app, headed Signed in as the owner, with the viewer's id hidden, Visits: 0 and a Visit again button.",
  },
  "admin-codes": {
    address: "admin.robkit.localhost:3000",
    alt: "Admin's access codes: a row each for Alex, Sam, Grandma and Test, with the code, its intro link and a Copy button, No expiry, Live, and a Revoke button.",
  },
  "admin-roles": {
    address: "admin.robkit.localhost:3000",
    alt: "Admin's roles: a form to create a role and choose its guests, then Family, held by Sam and Grandma, and Friends, held by Alex and Sam.",
  },
} as const satisfies Record<string, Screenshot>;

export type ScreenshotName = keyof typeof screenshots;
