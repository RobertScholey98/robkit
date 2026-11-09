package conformance

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

// AddressCase is one row of tooling/test-session/address-cases.json: a page
// load on App, owner-only, with the headers a proxy or an attacker might
// send. @robkit/session's tests read the same file.
type AddressCase struct {
	Name string
	// Core is core's origin, as the app's settings name it.
	Core string
	// Target is the path and query on the request line.
	Target string
	// Headers are the request's headers, by lowercase name. No "host"
	// sends none.
	Headers map[string]string
	// SignedOut says the browser holds core's word that nobody is signed
	// in, so the guard sends it to the hub to log in. Otherwise it holds
	// nothing, and the guard sends it to core for a token.
	SignedOut bool
	// Next is the page the guard asks core or the hub to send the browser
	// back to.
	Next string
}

// addressPath is address-cases.json in the checkout this file is in.
func addressPath() string {
	return filepath.Join(filepath.Dir(path()), "..", "..", "tooling", "test-session", "address-cases.json")
}

// AddressCases reads every address case, failing the test on a file or
// case that won't do.
func AddressCases(t testing.TB) []AddressCase {
	t.Helper()
	data, err := os.ReadFile(addressPath())
	if err != nil {
		t.Fatalf("can't read the guard's address cases: %v", err)
	}
	var rows []struct {
		Name      string            `json:"name"`
		Core      string            `json:"core"`
		Target    string            `json:"target"`
		Headers   map[string]string `json:"headers"`
		SignedOut bool              `json:"signedOut"`
		Next      string            `json:"next"`
	}
	if err := json.Unmarshal(data, &rows); err != nil {
		t.Fatalf("address-cases.json must be a list of cases: %v", err)
	}
	cases := make([]AddressCase, 0, len(rows))
	for i, row := range rows {
		if row.Name == "" || row.Core == "" || row.Target == "" || row.Next == "" || row.Headers == nil {
			t.Fatalf("address-cases.json[%d] (%s) needs a name, core, target, headers and next", i, row.Name)
		}
		cases = append(cases, AddressCase(row))
	}
	if len(cases) == 0 {
		t.Fatal("address-cases.json holds no cases")
	}
	return cases
}
