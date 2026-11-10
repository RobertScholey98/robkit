package main

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
)

// databaseVisits stores visits in db's visit table, which
// migrations/0001_init.sql makes.
type databaseVisits struct{ db *pgxpool.Pool }

// visitsIn is the store the server hands the routes.
func visitsIn(db *pgxpool.Pool) databaseVisits {
	return databaseVisits{db}
}

func (v databaseVisits) record(ctx context.Context, viewerID string) error {
	_, err := v.db.Exec(ctx, "insert into visit (viewer) values ($1)", viewerID)
	return err
}

func (v databaseVisits) count(ctx context.Context, viewerID string) (int64, error) {
	var visits int64
	err := v.db.QueryRow(ctx, "select count(*) from visit where viewer = $1", viewerID).Scan(&visits)
	return visits, err
}
