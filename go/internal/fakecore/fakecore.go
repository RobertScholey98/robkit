// Package fakecore is core as an app's guard sees it, for this module's
// tests: a key that signs tokens shaped like core's, and a server on a
// loopback port serving core's JWKS and each app's access rule. It ports
// @internal/test-session's fakeCore.
package fakecore

import (
	"crypto/ed25519"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"regexp"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/RobertScholey98/robkit/go/internal/conformance"
)

// App is the app the guard's tests guard, unless they name another.
const App = "example"

// Lifetime is how long core's tokens live.
const Lifetime = 15 * time.Minute

// Holder is whose session a token is for.
type Holder struct {
	Kind  string
	ID    string
	Roles []string
}

// Owner is the owner, as the tokens below name them.
var Owner = Holder{Kind: "owner", ID: "owner-1"}

// Guest is a guest holding roles, by id.
func Guest(roles ...string) Holder {
	if roles == nil {
		roles = []string{}
	}
	return Holder{Kind: "guest", ID: "code-1", Roles: roles}
}

// Key stands in for core's signing key.
type Key struct {
	Kid     string
	private ed25519.PrivateKey
	public  ed25519.PublicKey
}

// NewKey makes a key that names itself kid.
func NewKey(t testing.TB, kid string) *Key {
	t.Helper()
	public, private, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	return &Key{Kid: kid, private: private, public: public}
}

// JWK is the public half as core serves it in its JWKS.
func (k *Key) JWK() map[string]any {
	return map[string]any{
		"kty": "OKP",
		"crv": "Ed25519",
		"x":   base64.RawURLEncoding.EncodeToString(k.public),
		"kid": k.Kid,
		"alg": "EdDSA",
	}
}

// TokenOptions shape a token. The zero value is a live token for the owner
// and App.
type TokenOptions struct {
	// Age is how long ago core issued it.
	Age time.Duration
	// Holder is the owner if its Kind is empty.
	Holder Holder
	// Audience is App if empty: an app's slug, or "core" for core's own
	// token, which carries the session's id.
	Audience string
	// NoAudience leaves the audience out, as an older robkit did.
	NoAudience bool
	// Kid is the key's own if empty.
	Kid string
	// Header and Claims replace the protected header's and the payload's
	// fields, or add to them. A nil value removes one.
	Header map[string]any
	Claims map[string]any
	// Now is when it is, time.Now() if zero.
	Now time.Time
}

// Token is a session token shaped like core's.
func (k *Key) Token(o TokenOptions) string {
	now := o.Now
	if now.IsZero() {
		now = time.Now()
	}
	holder := o.Holder
	if holder.Kind == "" {
		holder = Owner
	}
	kid := o.Kid
	if kid == "" {
		kid = k.Kid
	}
	iat := now.Add(-o.Age).Unix()
	claims := map[string]any{
		"kind": holder.Kind,
		"sub":  holder.ID,
		"iat":  iat,
		"exp":  iat + int64(Lifetime/time.Second),
	}
	if holder.Kind == "guest" {
		claims["roles"] = holder.Roles
	}
	audience := o.Audience
	if audience == "" {
		audience = App
	}
	// Core's own token, and one with no audience, carry the session's id.
	// An app's token doesn't.
	if o.NoAudience || audience == "core" {
		claims["sid"] = "session-1"
	}
	if !o.NoAudience {
		claims["aud"] = audience
	}
	header := map[string]any{"alg": "EdDSA", "kid": kid}
	merge(header, o.Header)
	merge(claims, o.Claims)
	return k.Sign(header, claims)
}

func merge(into, from map[string]any) {
	for key, value := range from {
		if value == nil {
			delete(into, key)
		} else {
			into[key] = value
		}
	}
}

// Sign signs any header and payload, as JSON.
func (k *Key) Sign(header, payload any) string {
	encode := func(value any) string {
		data, err := json.Marshal(value)
		if err != nil {
			panic(err)
		}
		return base64.RawURLEncoding.EncodeToString(data)
	}
	input := encode(header) + "." + encode(payload)
	return input + "." + base64.RawURLEncoding.EncodeToString(ed25519.Sign(k.private, []byte(input)))
}

// SignedOutCookie is the app's cookie saying core said just now that nobody
// is signed in.
func SignedOutCookie() string {
	return fmt.Sprintf("robkit_session=signed-out.%d", time.Now().Unix())
}

// CookieFor is the Cookie header a conformance case's visitor sends slug, or
// "" for none: a token for it, another's token, or core's word that nobody
// is signed in.
func (k *Key) CookieFor(c conformance.Case, slug string) string {
	cookie := func(o TokenOptions) string { return "robkit_session=" + k.Token(o) }
	switch c.Session {
	case "signed-out":
		return SignedOutCookie()
	case "expired":
		return cookie(TokenOptions{Age: Lifetime + 5*time.Minute, Audience: slug})
	case "owner":
		return cookie(TokenOptions{Audience: slug})
	case "guest":
		roles := make([]string, 0, len(c.GuestRoles))
		for _, role := range c.GuestRoles {
			roles = append(roles, string(role))
		}
		return cookie(TokenOptions{Holder: Guest(roles...), Audience: slug})
	}
	switch c.OtherToken {
	case "another-app":
		return cookie(TokenOptions{Audience: "not" + slug})
	case "core":
		return cookie(TokenOptions{Audience: "core"})
	case "no-audience":
		return cookie(TokenOptions{NoAudience: true})
	}
	return ""
}

// Core is core on a loopback port, serving its JWKS and each app's rule.
type Core struct {
	// Origin is core's public origin, http://core.robkit.localhost:<port>.
	Origin string
	// Hub is the hub's origin beside it.
	Hub string
	// Key is the key core signs sessions with.
	Key *Key

	mu      sync.Mutex
	keys    []*Key
	rules   map[string]string
	status  int
	fetched []string
}

var accessPath = regexp.MustCompile(`^/apps/([^/]+)/access$`)

// Start starts core for one test. It stops when the test finishes.
func Start(t testing.TB) *Core {
	t.Helper()
	key := NewKey(t, "key-1")
	core := &Core{Key: key, keys: []*Key{key}, rules: map[string]string{}, status: http.StatusOK}
	server := httptest.NewServer(http.HandlerFunc(core.serve))
	t.Cleanup(server.Close)
	port := server.URL[strings.LastIndex(server.URL, ":")+1:]
	core.Origin = "http://core.robkit.localhost:" + port
	core.Hub = "http://hub.robkit.localhost:" + port
	return core
}

func (c *Core) serve(w http.ResponseWriter, r *http.Request) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.fetched = append(c.fetched, r.Host+" "+r.URL.RequestURI())
	w.Header().Set("content-type", "application/json")
	answer := func(status int, body string) {
		w.WriteHeader(status)
		_, _ = w.Write([]byte(body))
	}
	if c.status != http.StatusOK {
		answer(c.status, `{"error":"Down"}`)
		return
	}
	if r.URL.Path == "/.well-known/jwks.json" {
		keys := make([]map[string]any, 0, len(c.keys))
		for _, key := range c.keys {
			keys = append(keys, key.JWK())
		}
		data, _ := json.Marshal(map[string]any{"keys": keys})
		answer(http.StatusOK, string(data))
		return
	}
	if match := accessPath.FindStringSubmatch(r.URL.Path); match != nil {
		if rule, ok := c.rules[match[1]]; ok {
			answer(http.StatusOK, rule)
			return
		}
	}
	answer(http.StatusNotFound, `{"error":"Not found"}`)
}

// SetRule sets slug's rule in core's catalog, as JSON.
func (c *Core) SetRule(slug, rule string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.rules[slug] = rule
}

// SetStatus fails every request with status, such as 503, or stops
// failing with 200.
func (c *Core) SetStatus(status int) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.status = status
}

// Rotate starts serving key as well, as core does when it rotates its key.
func (c *Core) Rotate(key *Key) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.keys = append(c.keys, key)
}

// Fetched is each request core got, as "<host> <path>".
func (c *Core) Fetched() []string {
	c.mu.Lock()
	defer c.mu.Unlock()
	return append([]string(nil), c.fetched...)
}
