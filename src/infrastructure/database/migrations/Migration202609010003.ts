import { Migration } from "@mikro-orm/migrations";

export class Migration202609010003 extends Migration {
  async up(): Promise<void> {
    this.addSql(`
      drop index if exists one_refund_per_reference;
      drop index if exists one_rollback_per_reference;

      create unique index one_refund_per_reference
        on wager_transactions(reference_transaction_id)
        where kind = 'REFUND' and status = 'PROCESSED';

      create unique index one_rollback_per_reference
        on wager_transactions(reference_transaction_id)
        where kind = 'ROLLBACK' and status = 'PROCESSED';
    `);
  }

  async down(): Promise<void> {
    this.addSql(`
      drop index if exists one_refund_per_reference;
      drop index if exists one_rollback_per_reference;

      create unique index one_refund_per_reference
        on wager_transactions(reference_transaction_id)
        where kind = 'REFUND' and status <> 'FAILED';

      create unique index one_rollback_per_reference
        on wager_transactions(reference_transaction_id)
        where kind = 'ROLLBACK' and status <> 'FAILED';
    `);
  }
}
