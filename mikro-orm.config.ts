import { defineConfig } from "@mikro-orm/postgresql";
import { Migrator } from "@mikro-orm/migrations";
import { entities } from "./src/infrastructure/database/entities";

export default defineConfig({
  clientUrl:
    process.env.DATABASE_URL ??
    "postgresql://wager:wager@127.0.0.1:5432/wagering",
  entities,
  extensions: [Migrator],
  migrations: {
    path: "src/infrastructure/database/migrations",
    transactional: true,
  },
});
