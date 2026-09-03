import { MikroORM } from "@mikro-orm/postgresql";
import config from "../../../mikro-orm.config";

async function migrate() {
  const orm = await MikroORM.init(config);
  if (process.argv[2] === "down") {
    await orm.getMigrator().down();
  } else {
    await orm.getMigrator().up();
  }
  await orm.close();
}

void migrate();
