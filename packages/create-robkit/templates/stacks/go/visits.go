package main

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
)

// visitsIn records visits in db's visit table, which
// migrations/0001_init.sql makes.
func visitsIn(db *pgxpool.Pool) recordVisit {
	return func(ctx context.Context, viewerID string) (int64, error) {
		if _, err := db.Exec(ctx, "insert into visit (viewer) values ($1)", viewerID); err != nil {
			return 0, err
		}
		var visits int64
		err := db.QueryRow(ctx, "select count(*) from visit where viewer = $1", viewerID).Scan(&visits)
		return visits, err
	}
}
