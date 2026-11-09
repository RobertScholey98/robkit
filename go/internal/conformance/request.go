package conformance

import (
	"encoding/hex"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
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

// CookieCase is one row of the "cookies" list in request-cases.json: a page
// load on App, open to anyone, whose Cookie header carries core's word that
// nobody is signed in under some name. A guard that reads it as the session
// cookie lets the browser in as nobody. One that doesn't sends it to core,
// as it would a browser holding nothing.
type CookieCase struct {
	Name string
	// Core is core's origin, as the app's settings name it.
	Core string
	// Cookie is the Cookie header's bytes, as a browser sends them. The
	// file gives them in hex, since a JSON string can't carry every byte to
	// both ports. Go's server hands them on as they are.
	Cookie string
	// Now is when, in seconds since 1970, the runner's clock says it is.
	Now int64
	// Reads says whether the guard reads the cookie as the session cookie.
	Reads bool
}

// CookieCases reads every cookie case, failing the test on a file or case
// that won't do.
func CookieCases(t testing.TB) []CookieCase {
	t.Helper()
	data, err := os.ReadFile(requestPath())
	if err != nil {
		t.Fatalf("can't read the request guard's cases: %v", err)
	}
	var file struct {
		Cookies []struct {
			Name   string `json:"name"`
			Core   string `json:"core"`
			Cookie string `json:"cookie"`
			Now    int64  `json:"now"`
			Reads  *bool  `json:"reads"`
		} `json:"cookies"`
	}
	if err := json.Unmarshal(data, &file); err != nil {
		t.Fatalf("request-cases.json must be an object with a cookies list of cases: %v", err)
	}
	cases := make([]CookieCase, 0, len(file.Cookies))
	for i, row := range file.Cookies {
		cookie, err := hex.DecodeString(strings.ReplaceAll(row.Cookie, " ", ""))
		if row.Name == "" || row.Core == "" || row.Cookie == "" || err != nil || row.Now == 0 || row.Reads == nil {
			t.Fatalf("request-cases.json cookies[%d] (%s) needs a name, core, cookie as bytes in hex, now and reads", i, row.Name)
		}
		cases = append(cases, CookieCase{Name: row.Name, Core: row.Core, Cookie: string(cookie), Now: row.Now, Reads: *row.Reads})
	}
	if len(cases) == 0 {
		t.Fatal("request-cases.json holds no cookie cases")
	}
	return cases
}

// CoreAddressCase is one row of the "coreAddress" list in
// request-cases.json: an address of core, always a bare origin, and whether
// each port accepts it, from settings or written in code. An http origin
// passes only on a local domain.
type CoreAddressCase struct {
	Origin   string
	Accepted bool
}

// CoreAddressCases reads every core address case, failing the test on a
// file or case that won't do.
func CoreAddressCases(t testing.TB) []CoreAddressCase {
	t.Helper()
	data, err := os.ReadFile(requestPath())
	if err != nil {
		t.Fatalf("can't read the request guard's cases: %v", err)
	}
	var file struct {
		CoreAddress []struct {
			Origin   string `json:"origin"`
			Accepted *bool  `json:"accepted"`
		} `json:"coreAddress"`
	}
	if err := json.Unmarshal(data, &file); err != nil {
		t.Fatalf("request-cases.json must be an object with a coreAddress list of cases: %v", err)
	}
	cases := make([]CoreAddressCase, 0, len(file.CoreAddress))
	for i, row := range file.CoreAddress {
		if row.Origin == "" || row.Accepted == nil {
			t.Fatalf("request-cases.json coreAddress[%d] needs an origin and accepted", i)
		}
		cases = append(cases, CoreAddressCase{Origin: row.Origin, Accepted: *row.Accepted})
	}
	if len(cases) == 0 {
		t.Fatal("request-cases.json holds no core address cases")
	}
	return cases
}
