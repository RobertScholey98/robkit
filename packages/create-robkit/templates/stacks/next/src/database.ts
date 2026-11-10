import { appDatabase } from "@robkit/drizzle";
import * as schema from "./schema.ts";

export const database = appDatabase(schema);
