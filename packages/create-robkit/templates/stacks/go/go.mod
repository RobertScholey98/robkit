module app

go 1.26.0

require (
	github.com/RobertScholey98/robkit/go v0.0.0-00010101000000-000000000000
	github.com/jackc/pgx/v5 v5.12.0
)

require (
	github.com/jackc/pgpassfile v1.0.0 // indirect
	github.com/jackc/pgservicefile v0.0.0-20240606120523-5a60cdf6a761 // indirect
	github.com/jackc/puddle/v2 v2.2.3 // indirect
	golang.org/x/sync v0.22.0 // indirect
	golang.org/x/text v0.41.0 // indirect
)

// robkit's guard for Go isn't on a module proxy. robkit vendor copies it
// to the install's vendor/robkit/go, and an install made with --link
// points this at the robkit checkout instead.
replace github.com/RobertScholey98/robkit/go => ../../vendor/robkit/go
