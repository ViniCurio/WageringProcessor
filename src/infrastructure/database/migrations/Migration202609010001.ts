import { Migration } from "@mikro-orm/migrations";

export class Migration202609010001 extends Migration {
  async up(): Promise<void> {
    this.addSql(`
      create table wallets (
        id uuid primary key,
        player_id uuid not null,
        currency varchar(3) not null,
        balance numeric(20, 2) not null check (balance >= 0),
        version int not null check (version >= 1),
        created_at timestamptz not null,
        updated_at timestamptz not null,
        unique (player_id, currency)
      );

      create table wager_transactions (
        id uuid primary key,
        provider_id text not null,
        external_transaction_id text not null,
        idempotency_key text not null unique,
        payload_hash char(64) not null,
        wallet_id uuid not null references wallets(id),
        player_id uuid not null,
        round_id text not null,
        game_id text not null,
        kind text not null check (
          kind in ('OPENING', 'BET', 'WIN', 'LOSS', 'REFUND', 'ROLLBACK')
        ),
        amount numeric(20, 2) not null check (amount >= 0),
        currency varchar(3) not null,
        reference_external_transaction_id text,
        reference_transaction_id uuid references wager_transactions(id),
        status text not null check (
          status in ('PENDING', 'PENDING_REFERENCE', 'PROCESSED', 'REJECTED', 'FAILED')
        ),
        failure_code text,
        resulting_balance numeric(20, 2),
        pending_attempts int not null default 0,
        next_attempt_at timestamptz,
        created_at timestamptz not null,
        processed_at timestamptz,
        unique (provider_id, external_transaction_id)
      );

      create unique index one_refund_per_reference
        on wager_transactions(reference_transaction_id)
        where kind = 'REFUND' and status <> 'FAILED';

      create unique index one_rollback_per_reference
        on wager_transactions(reference_transaction_id)
        where kind = 'ROLLBACK' and status <> 'FAILED';

      create table wallet_ledger_entries (
        id uuid primary key,
        wallet_id uuid not null references wallets(id),
        transaction_id uuid not null unique references wager_transactions(id),
        direction text not null check (direction in ('DEBIT', 'CREDIT')),
        amount numeric(20, 2) not null check (amount > 0),
        currency varchar(3) not null,
        balance_before numeric(20, 2) not null check (balance_before >= 0),
        balance_after numeric(20, 2) not null check (balance_after >= 0),
        created_at timestamptz not null,
        check (
          (direction = 'CREDIT' and balance_before + amount = balance_after)
          or (direction = 'DEBIT' and balance_before - amount = balance_after)
        )
      );

      create index ledger_cursor_idx
        on wallet_ledger_entries(wallet_id, created_at, id);

      create table inbox_messages (
        id bigserial primary key,
        consumer_name text not null,
        message_id text not null,
        payload_hash char(64) not null,
        received_at timestamptz not null,
        processed_at timestamptz,
        unique (consumer_name, message_id)
      );

      create table outbox_messages (
        id uuid primary key,
        aggregate_id uuid not null,
        event_type text not null,
        payload jsonb not null,
        occurred_at timestamptz not null,
        attempts int not null default 0,
        next_attempt_at timestamptz,
        published_at timestamptz
      );

      create index outbox_pending_idx
        on outbox_messages(published_at, next_attempt_at, occurred_at);

      create or replace function immutable_ledger()
      returns trigger
      language plpgsql
      as $$
      begin
        raise exception 'ledger entries are immutable';
      end
      $$;

      create trigger ledger_no_update
        before update or delete on wallet_ledger_entries
        for each row execute function immutable_ledger();
    `);
  }

  async down(): Promise<void> {
    this.addSql(`
      drop table if exists outbox_messages;
      drop table if exists inbox_messages;
      drop table if exists wallet_ledger_entries;
      drop function if exists immutable_ledger();
      drop table if exists wager_transactions;
      drop table if exists wallets;
    `);
  }
}
