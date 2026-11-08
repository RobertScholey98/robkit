// Package conformance reads packages/guard/conformance.json, the cases the
// guard and every adapter pass, for this module's tests. It reads the file
// from the robkit checkout, so the Go guard and the TypeScript one share
// one set of cases.
package conformance

import (
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
	"slices"
	"testing"

	"github.com/RobertScholey98/robkit/go/guard"
)

// Case is one row of conformance.json. Session names who is asking, as the
// app knows them: someone it holds nothing for yet ("unknown"), someone core
// just said isn't signed in ("signed-out"), a holder of an expired token for
// the app ("expired"), the owner ("owner") or a guest ("guest").
type Case struct {
	Name string
	Rule guard.AccessRule
	// Session is unknown, signed-out, expired, owner or guest.
	Session string
	// GuestRoles are the roles a guest holds, by id.
	GuestRoles []guard.RoleID
	// OtherToken is, with "unknown", the owner's live token the visitor
	// sends that isn't for this app: "another-app", "core" or
	// "no-audience". Empty for none.
	OtherToken string
	// Outcome is allow, login, refresh or not-found.
	Outcome string
}

var (
	sessions    = []string{"unknown", "signed-out", "expired", "owner", "guest"}
	otherTokens = []string{"", "another-app", "core", "no-audience"}
	outcomes    = []string{"allow", "login", "refresh", "not-found"}
)

// path is conformance.json in the checkout this file is in.
func path() string {
	_, file, _, _ := runtime.Caller(0)
	return filepath.Join(filepath.Dir(file), "..", "..", "..", "packages", "guard", "conformance.json")
}

// Cases reads every case, failing the test on a file or case that won't do.
func Cases(t testing.TB) []Case {
	t.Helper()
	data, err := os.ReadFile(path())
	if err != nil {
		t.Fatalf("can't read the guard's conformance cases: %v", err)
	}
	var rows []struct {
		Name       string          `json:"name"`
		Rule       json.RawMessage `json:"rule"`
		Session    string          `json:"session"`
		GuestRoles []string        `json:"guestRoles"`
		OtherToken string          `json:"otherToken"`
		Outcome    string          `json:"outcome"`
	}
	if err := json.Unmarshal(data, &rows); err != nil {
		t.Fatalf("conformance.json must be a list of cases: %v", err)
	}
	cases := make([]Case, 0, len(rows))
	for i, row := range rows {
		rule, err := guard.ReadAccessRule(row.Rule)
		if err != nil {
			t.Fatalf("conformance.json[%d] (%s): %v", i, row.Name, err)
		}
		if !slices.Contains(sessions, row.Session) ||
			!slices.Contains(otherTokens, row.OtherToken) ||
			!slices.Contains(outcomes, row.Outcome) {
			t.Fatalf("conformance.json[%d] (%s) names a session, other token or outcome this module doesn't know", i, row.Name)
		}
		roles := make([]guard.RoleID, 0, len(row.GuestRoles))
		for _, role := range row.GuestRoles {
			roles = append(roles, guard.RoleID(role))
		}
		cases = append(cases, Case{
			Name:       row.Name,
			Rule:       rule,
			Session:    row.Session,
			GuestRoles: roles,
			OtherToken: row.OtherToken,
			Outcome:    row.Outcome,
		})
	}
	if len(cases) == 0 {
		t.Fatal("conformance.json holds no cases")
	}
	return cases
}
