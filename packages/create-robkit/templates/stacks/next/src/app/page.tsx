import { viewer } from "@robkit/next";
import { Home } from "../home.tsx";
import { visits } from "../visits.ts";

/** The home page: src/home.tsx, as whoever is asking. */
export default async function Page() {
  return <Home viewer={await viewer()} visits={visits} />;
}
