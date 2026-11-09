package conformance

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

// AddressCase is one row of the "address" list in
// tooling/test-session/request-cases.json, which holds the cases every port
// of the request guard must pass, one list per kind. It is a page load on App, owner-only, with the headers a proxy or an attacker might
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

// requestPath is request-cases.json in the checkout this file is in.
func requestPath() string {
	return filepath.Join(filepath.Dir(path()), "..", "..", "tooling", "test-session", "request-cases.json")
}

// AddressCases reads every address case, failing the test on a file or
// case that won't do.
func AddressCases(t testing.TB) []AddressCase {
	t.Helper()
	data, err := os.ReadFile(requestPath())
	if err != nil {
		t.Fatalf("can't read the request guard's cases: %v", err)
	}
	var file struct {
		Address []struct {
			Name      string            `json:"name"`
			Core      string            `json:"core"`
			Target    string            `json:"target"`
			Headers   map[string]string `json:"headers"`
			SignedOut bool              `json:"signedOut"`
			Next      string            `json:"next"`
		} `json:"address"`
	}
	if err := json.Unmarshal(data, &file); err != nil {
		t.Fatalf("request-cases.json must be an object with an address list of cases: %v", err)
	}
	rows := file.Address
	cases := make([]AddressCase, 0, len(rows))
	for i, row := range rows {
		if row.Name == "" || row.Core == "" || row.Target == "" || row.Next == "" || row.Headers == nil {
			t.Fatalf("request-cases.json address[%d] (%s) needs a name, core, target, headers and next", i, row.Name)
		}
		cases = append(cases, AddressCase(row))
	}
	if len(cases) == 0 {
		t.Fatal("request-cases.json holds no address cases")
	}
	return cases
}
