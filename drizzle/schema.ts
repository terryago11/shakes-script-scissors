import {
  mysqlTable,
  varchar,
  text,
  timestamp,
  mysqlEnum,
  int,
  index,
} from "drizzle-orm/mysql-core";

export const projects = mysqlTable("projects", {
  id:          varchar("id", { length: 16 }).primaryKey(),
  playId:      varchar("play_id", { length: 10 }).notNull(),
  playTitle:   text("play_title").notNull(),
  activeCutId: varchar("active_cut_id", { length: 16 }),
  createdAt:   timestamp("created_at").defaultNow().notNull(),
  updatedAt:   timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const actors = mysqlTable(
  "actors",
  {
    id:        varchar("id", { length: 16 }).primaryKey(),
    projectId: varchar("project_id", { length: 16 })
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name:      text("name").notNull(),
    color:     varchar("color", { length: 7 }).notNull(),
  },
  (t) => [index("actors_project_idx").on(t.projectId)]
);

export const assignments = mysqlTable(
  "assignments",
  {
    id:          int("id").autoincrement().primaryKey(),
    projectId:   varchar("project_id", { length: 16 })
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    characterId: varchar("character_id", { length: 64 }).notNull(),
    actorId:     varchar("actor_id", { length: 16 }).notNull(),
  },
  (t) => [index("assignments_project_idx").on(t.projectId)]
);

export const cuts = mysqlTable(
  "cuts",
  {
    id:        varchar("id", { length: 16 }).primaryKey(),
    projectId: varchar("project_id", { length: 16 })
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name:      text("name").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("cuts_project_idx").on(t.projectId)]
);

export const cutMapEntries = mysqlTable(
  "cut_map_entries",
  {
    id:     int("id").autoincrement().primaryKey(),
    cutId:  varchar("cut_id", { length: 16 })
      .notNull()
      .references(() => cuts.id, { onDelete: "cascade" }),
    unitId: varchar("unit_id", { length: 32 }).notNull(),
    status: mysqlEnum("status", ["cut", "kept"]).notNull().default("cut"),
  },
  (t) => [
    index("cme_cut_idx").on(t.cutId),
    index("cme_cut_unit_idx").on(t.cutId, t.unitId),
  ]
);
