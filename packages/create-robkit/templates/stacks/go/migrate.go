package main

import (
	"context"
	"embed"
	"fmt"
	"io/fs"
	"os"
	"path"
	"slices"

	"github.com/jackc/pgx/v5"
)

// The migrations, in the binary, so the container needs no files beside it.
//
//go:embed migrations/*.sql
var migrations embed.FS

// migrate applies each migration in migrations/ that hasn't run, in name
// order, and records it in schema_migrations. They run in one transaction,
// which locks that table, so two containers starting at once take turns
// and a failure leaves nothing half done. Names without a schema land in
// the app's own, which is first on its role's search path.
func migrate(ctx context.Context) error {
	databaseURL, err := readDatabaseURL(os.Getenv)
	if err != nil {
		return err
	}
	conn, err := pgx.Connect(ctx, databaseURL)
	if err != nil {
		return fmt.Errorf("can't connect to DATABASE_URL: %w", err)
	}
	defer conn.Close(ctx)

	if err := createJournal(ctx, conn); err != nil {
		return err
	}
	tx, err := conn.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if _, err := tx.Exec(ctx, "lock table schema_migrations in exclusive mode"); err != nil {
		return err
	}
	rows, _ := tx.Query(ctx, "select name from schema_migrations")
	applied, err := pgx.CollectRows(rows, pgx.RowTo[string])
	if err != nil {
		return err
	}
	files, err := fs.Glob(migrations, "migrations/*.sql")
	if err != nil {
		return err
	}
	for _, file := range files {
		name := path.Base(file)
		if slices.Contains(applied, name) {
			continue
		}
		sql, err := migrations.ReadFile(file)
		if err != nil {
			return err
		}
		// With no arguments, pgx sends the file as one simple query, so
		// it may hold several statements.
		if _, err := tx.Exec(ctx, string(sql)); err != nil {
			return fmt.Errorf("migration %s failed: %w", name, err)
		}
		if _, err := tx.Exec(ctx, "insert into schema_migrations (name) values ($1)", name); err != nil {
			return err
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return err
	}
	fmt.Println("migrated")
	return nil
}

// createJournal creates schema_migrations unless it exists. Two runs that
// both find it missing both try to create it, and Postgres refuses the
// later one. Which error it gives depends on how far the first had got, so
// the refused run doesn't sort them. Postgres gives each only once the
// first run has committed, so it looks for the table, and goes on if it is
// there. It looks in pg_tables, not with to_regclass, which would also find
// a type or a view of that name.
func createJournal(ctx context.Context, conn *pgx.Conn) error {
	_, err := conn.Exec(ctx, `create table if not exists schema_migrations (
		name text primary key,
		applied_at timestamptz not null default now()
	)`)
	if err == nil {
		return nil
	}
	var made bool
	if look := conn.QueryRow(ctx, `select exists (
		select from pg_tables
		where schemaname = current_schema() and tablename = 'schema_migrations'
	)`).Scan(&made); look != nil || !made {
		return err
	}
	return nil
}
