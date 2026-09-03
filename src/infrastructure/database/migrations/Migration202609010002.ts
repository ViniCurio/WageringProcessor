import { Migration } from "@mikro-orm/migrations";

export class Migration202609010002 extends Migration {
  async up(): Promise<void> {
    this.addSql(`
      alter table outbox_messages
        add column locked_by text null,
        add column locked_until timestamptz null;

      create index outbox_claim_idx
        on outbox_messages(
          published_at,
          locked_until,
          next_attempt_at,
          occurred_at
        );
    `);
  }

  async down(): Promise<void> {
    this.addSql(`
      drop index if exists outbox_claim_idx;

      alter table outbox_messages
        drop column locked_by,
        drop column locked_until;
    `);
  }
}
