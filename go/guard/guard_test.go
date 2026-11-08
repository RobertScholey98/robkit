package guard_test

import (
	"encoding/json"
	"reflect"
	"testing"

	"github.com/RobertScholey98/robkit/go/guard"
	"github.com/RobertScholey98/robkit/go/internal/conformance"
)

// viewerOf is who a case's visitor is, once the app holds a live token.
func viewerOf(c conformance.Case) guard.Viewer {
	switch c.Session {
	case "owner":
		return guard.Owner{ID: "owner-1"}
	case "guest":
		return guard.Guest{ID: "code-1", Roles: c.GuestRoles}
	case "signed-out":
		return guard.Nobody{}
	}
	return nil
}

func sessionOf(t *testing.T, c conformance.Case) guard.SessionState {
	t.Helper()
	switch c.Session {
	case "unknown":
		return guard.Unknown{}
	case "signed-out":
		return guard.SignedOut{}
	case "expired":
		return guard.Expired{}
	case "owner":
		return guard.SignedIn{Viewer: guard.Owner{ID: "owner-1"}}
	case "guest":
		return guard.SignedIn{Viewer: guard.Guest{ID: "code-1", Roles: c.GuestRoles}}
	}
	t.Fatalf("no session for %q", c.Session)
	return nil
}

func TestDecideConformance(t *testing.T) {
	for _, c := range conformance.Cases(t) {
		t.Run(c.Name, func(t *testing.T) {
			decision := guard.Decide(c.Rule, sessionOf(t, c))

			var want guard.Decision
			switch c.Outcome {
			case "allow":
				want = guard.Allow{Viewer: viewerOf(c)}
			case "login":
				want = guard.Login{}
			case "refresh":
				want = guard.Refresh{}
			case "not-found":
				want = guard.NotFound{}
			}
			if !reflect.DeepEqual(decision, want) {
				t.Errorf("Decide = %#v, want %#v", decision, want)
			}
			if decision.Outcome() != c.Outcome {
				t.Errorf("Outcome() = %q, want %q", decision.Outcome(), c.Outcome)
			}
		})
	}
}

func TestDecideLetsTheOwnerIntoAnOwnerOnlyAppAsThemselves(t *testing.T) {
	decision := guard.Decide(guard.OwnerRule{}, guard.SignedIn{Viewer: guard.Owner{ID: "abc"}})

	if want := (guard.Allow{Viewer: guard.Owner{ID: "abc"}}); !reflect.DeepEqual(decision, want) {
		t.Errorf("Decide = %#v, want %#v", decision, want)
	}
}

func TestReadAccessRule(t *testing.T) {
	for text, want := range map[string]guard.AccessRule{
		`{"kind": "open"}`:  guard.OpenRule{},
		`{"kind": "owner"}`: guard.OwnerRule{},
		`{"kind": "roles", "roles": ["role-1", "role-2"]}`: guard.RolesRule{Roles: []guard.RoleID{"role-1", "role-2"}},
		// Only what a rule needs.
		`{"kind": "open", "roles": ["role-1"]}`: guard.OpenRule{},
	} {
		rule, err := guard.ReadAccessRule([]byte(text))
		if err != nil || !reflect.DeepEqual(rule, want) {
			t.Errorf("ReadAccessRule(%s) = %#v, %v; want %#v", text, rule, err, want)
		}
	}
}

func TestReadAccessRuleRefuses(t *testing.T) {
	for _, text := range []string{
		`null`,
		`"open"`,
		`{}`,
		`{"kind":"everyone"}`,
		`{"kind":"roles"}`,
		`{"kind":"roles","roles":"role-1"}`,
		`{"kind":"roles","roles":["role-1",2]}`,
		`{"kind":"roles","roles":["role-1",""]}`,
		`{"kind": "roles",  "roles": []`,
	} {
		_, err := guard.ReadAccessRule([]byte(text))
		want := text + ` isn't an access rule. Use {"kind": "open"}, {"kind": "owner"}, or {"kind": "roles", "roles": [...]} listing role ids.`
		if err == nil || err.Error() != want {
			t.Errorf("ReadAccessRule(%s) = %v, want %q", text, err, want)
		}
	}
}

func TestViewersMarshalAsTheTypeScriptGuardHandsThemToHandlers(t *testing.T) {
	for _, tc := range []struct {
		viewer guard.Viewer
		want   string
	}{
		{guard.Owner{ID: "owner-1"}, `{"kind":"owner","id":"owner-1"}`},
		{guard.Guest{ID: "code-1", Roles: []guard.RoleID{"family"}}, `{"kind":"guest","id":"code-1","roles":["family"]}`},
		{guard.Guest{ID: "code-1"}, `{"kind":"guest","id":"code-1","roles":[]}`},
		{guard.Nobody{}, `{"kind":"nobody"}`},
	} {
		got, err := json.Marshal(tc.viewer)
		if err != nil || string(got) != tc.want {
			t.Errorf("json.Marshal(%#v) = %s, %v; want %s", tc.viewer, got, err, tc.want)
		}
		if kind := tc.viewer.Kind(); `{"kind":"`+kind+`"` != tc.want[:len(kind)+10] {
			t.Errorf("Kind() = %q for %s", kind, tc.want)
		}
	}
}
