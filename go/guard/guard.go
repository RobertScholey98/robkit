// Package guard is the pure decision of who may open an app, ported from
// @robkit/guard. Given an app's access rule and what the app knows about
// who is asking, Decide answers allow, login, refresh or not found.
//
// An app doesn't call it itself: the session package's Guarded runs it
// on every request. Both pass packages/guard/conformance.json, the
// cases every robkit guard decides the same way.
package guard

import (
	"bytes"
	"encoding/json"
	"errors"
)

// RoleID is a role's id, as core stores it. The guard doesn't know core's
// id scheme, so any text that isn't empty will do.
type RoleID string

// CodeID is an access code's id, which names a guest. Apps see it, never
// the code itself.
type CodeID string

// AccessRule is who may open an app: OpenRule, RolesRule or OwnerRule. The
// owner may open every app.
type AccessRule interface{ accessRule() }

// OpenRule lets anyone in, signed in or not.
type OpenRule struct{}

// RolesRule lets in the owner, and guests holding one of its roles.
type RolesRule struct{ Roles []RoleID }

// OwnerRule lets in only the owner.
type OwnerRule struct{}

func (OpenRule) accessRule()  {}
func (RolesRule) accessRule() {}
func (OwnerRule) accessRule() {}

// Viewer is who is asking, as the app's handlers see it after the guard:
// Owner, Guest, or Nobody in an app open to anyone. Switch on its type.
type Viewer interface {
	// Kind is "owner", "guest" or "nobody", as in the viewer's JSON.
	Kind() string
	viewer()
}

// SignedInViewer is someone with a live session: Owner or Guest.
type SignedInViewer interface {
	Viewer
	signedIn()
}

// Owner is the install's owner, with a live session.
type Owner struct{ ID string }

// Guest is a guest with a live session, by their code's id, holding their
// roles' ids.
type Guest struct {
	ID    CodeID
	Roles []RoleID
}

// Nobody is a visitor who isn't signed in, let into an open app.
type Nobody struct{}

func (Owner) Kind() string  { return "owner" }
func (Guest) Kind() string  { return "guest" }
func (Nobody) Kind() string { return "nobody" }
func (Owner) viewer()       {}
func (Guest) viewer()       {}
func (Nobody) viewer()      {}
func (Owner) signedIn()     {}
func (Guest) signedIn()     {}

// MarshalJSON writes {"kind": "owner", "id": ...}, as the TypeScript guard
// hands the viewer to an app's handlers.
func (o Owner) MarshalJSON() ([]byte, error) {
	return json.Marshal(struct {
		Kind string `json:"kind"`
		ID   string `json:"id"`
	}{"owner", o.ID})
}

// MarshalJSON writes {"kind": "guest", "id": ..., "roles": [...]}.
func (g Guest) MarshalJSON() ([]byte, error) {
	roles := g.Roles
	if roles == nil {
		roles = []RoleID{}
	}
	return json.Marshal(struct {
		Kind  string   `json:"kind"`
		ID    CodeID   `json:"id"`
		Roles []RoleID `json:"roles"`
	}{"guest", g.ID, roles})
}

// MarshalJSON writes {"kind": "nobody"}.
func (Nobody) MarshalJSON() ([]byte, error) {
	return []byte(`{"kind":"nobody"}`), nil
}

// SessionState is what the app knows of who is asking, once the guard has
// checked its cookie: it holds nothing from core yet and must ask
// (Unknown), core said nobody is signed in (SignedOut), the app's token has
// expired (Expired), or it holds a live token (SignedIn).
type SessionState interface{ sessionState() }

// Unknown means the app holds nothing from core yet, and must ask.
type Unknown struct{}

// SignedOut means core said nobody is signed in.
type SignedOut struct{}

// Expired means the app's token for this visitor has expired.
type Expired struct{}

// SignedIn means the app holds a live token for Viewer.
type SignedIn struct{ Viewer SignedInViewer }

func (Unknown) sessionState()   {}
func (SignedOut) sessionState() {}
func (Expired) sessionState()   {}
func (SignedIn) sessionState()  {}

// Decision is the guard's answer: Allow, Login, Refresh or NotFound.
type Decision interface {
	// Outcome is "allow", "login", "refresh" or "not-found", as in
	// conformance.json.
	Outcome() string
}

// Allow lets the request through to Viewer.
type Allow struct{ Viewer Viewer }

// Login sends the visitor to sign in at the hub.
type Login struct{}

// Refresh asks core who the visitor is.
type Refresh struct{}

// NotFound answers as if the app weren't there.
type NotFound struct{}

func (Allow) Outcome() string    { return "allow" }
func (Login) Outcome() string    { return "login" }
func (Refresh) Outcome() string  { return "refresh" }
func (NotFound) Outcome() string { return "not-found" }

// asking is who is asking, as far as the rule cares. A guest in the rule
// holds one of its roles.
type asking int

const (
	askUnknown asking = iota
	askSignedOut
	askExpired
	askOwner
	askGuest
	askGuestInRule
)

type outcome int

const (
	allow outcome = iota
	login
	refresh
	notFound
)

// The whole decision, one row per kind of rule, as in @robkit/guard.
var (
	openOutcomes = [...]outcome{
		askUnknown: refresh, askSignedOut: allow, askExpired: refresh,
		askOwner: allow, askGuest: allow, askGuestInRule: allow,
	}
	rolesOutcomes = [...]outcome{
		askUnknown: refresh, askSignedOut: login, askExpired: refresh,
		askOwner: allow, askGuest: notFound, askGuestInRule: allow,
	}
	ownerOutcomes = [...]outcome{
		askUnknown: refresh, askSignedOut: login, askExpired: refresh,
		askOwner: allow, askGuest: notFound, askGuestInRule: notFound,
	}
)

func askingOf(rule AccessRule, session SessionState) asking {
	switch s := session.(type) {
	case SignedOut:
		return askSignedOut
	case Expired:
		return askExpired
	case SignedIn:
		guest, isGuest := s.Viewer.(Guest)
		if !isGuest {
			return askOwner
		}
		if roles, gated := rule.(RolesRule); gated {
			for _, role := range roles.Roles {
				for _, held := range guest.Roles {
					if role == held {
						return askGuestInRule
					}
				}
			}
		}
		return askGuest
	}
	return askUnknown
}

// Decide decides what an app does with a request, from its rule and the
// session. A rule or session it doesn't know counts as the strictest: the
// owner-only rule, and a visitor it must ask core about.
func Decide(rule AccessRule, session SessionState) Decision {
	row := ownerOutcomes
	switch rule.(type) {
	case OpenRule:
		row = openOutcomes
	case RolesRule:
		row = rolesOutcomes
	}
	switch row[askingOf(rule, session)] {
	case login:
		return Login{}
	case refresh:
		return Refresh{}
	case notFound:
		return NotFound{}
	}
	if signedIn, ok := session.(SignedIn); ok {
		return Allow{Viewer: signedIn.Viewer}
	}
	return Allow{Viewer: Nobody{}}
}

// ReadAccessRule reads an access rule sent as JSON: {"kind": "open"},
// {"kind": "owner"}, or {"kind": "roles", "roles": [...]} listing role ids,
// each text that isn't empty.
func ReadAccessRule(data []byte) (AccessRule, error) {
	var shown bytes.Buffer
	if json.Compact(&shown, data) != nil {
		shown.Reset()
		shown.Write(data)
	}
	wrong := errors.New(shown.String() + ` isn't an access rule. Use {"kind": "open"}, {"kind": "owner"}, or {"kind": "roles", "roles": [...]} listing role ids.`)
	var rule struct {
		Kind  *string         `json:"kind"`
		Roles json.RawMessage `json:"roles"`
	}
	if json.Unmarshal(data, &rule) != nil || rule.Kind == nil {
		return nil, wrong
	}
	switch *rule.Kind {
	case "open":
		return OpenRule{}, nil
	case "owner":
		return OwnerRule{}, nil
	case "roles":
		var roles []string
		if json.Unmarshal(rule.Roles, &roles) != nil || roles == nil {
			return nil, wrong
		}
		ids := make([]RoleID, 0, len(roles))
		for _, role := range roles {
			if role == "" {
				return nil, wrong
			}
			ids = append(ids, RoleID(role))
		}
		return RolesRule{Roles: ids}, nil
	}
	return nil, wrong
}
