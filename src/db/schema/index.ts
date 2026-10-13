/**
 * Familee - re-export of the schema
 *
 * Every file mirrors its own block of the SQL migrations in db/migrations.
 * The source of truth is the SQL, not these files: Drizzle is only a typed
 * query builder here.
 *
 * The order of the re-exports is the order of creation in 0000_init.sql.
 */

export * from "./_custom";
export * from "./audit";
export * from "./auth";
export * from "./enums";
export * from "./events";
export * from "./families";
export * from "./media";
export * from "./members";
export * from "./notes";
export * from "./persons";
export * from "./places";
export * from "./relations";
export * from "./sources";
export * from "./trees";
export * from "./views";
