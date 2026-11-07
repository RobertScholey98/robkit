package session

import (
	"crypto/ed25519"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"slices"
	"sync"
	"time"
)

// keyCooldown is how long after fetching core's keys the guard waits before
// fetching them again for a token whose key it doesn't hold, as jose does.
const keyCooldown = 30 * time.Second

// errNoMatchingKey, errMultipleKeys and errEd448 mean the token names no
// key core serves, several, or one on a curve core doesn't sign with: a bad
// token, not a failure to check one.
var (
	errNoMatchingKey = errors.New("no key in core's key set matches the token")
	errMultipleKeys  = errors.New("several keys in core's key set match the token")
	errEd448         = errors.New("the token's key is on Ed448, which core doesn't sign with")
)

// isBadToken says whether err, from keyFor, means the token is bad rather
// than that the keys couldn't load.
func isBadToken(err error) bool {
	return errors.Is(err, errNoMatchingKey) || errors.Is(err, errMultipleKeys) || errors.Is(err, errEd448)
}

// keySet is core's public keys, fetched from its JWKS endpoint on first use
// and cached for good, so verifying a token needs no call to core. A token
// with a key the cache lacks fetches them again, at most every
// keyCooldown. It follows jose's createRemoteJWKSet, which the TypeScript
// guard uses.
type keySet struct {
	url    string
	client *http.Client
	now    func() time.Time

	mu       sync.Mutex
	keys     []map[string]any
	loaded   bool
	loadedAt time.Time
	pending  *load
}

// load is one fetch of core's keys, which requests that arrive while it
// runs wait on.
type load struct {
	done chan struct{}
	err  error
}

// reload fetches core's keys, joining a fetch already under way.
func (k *keySet) reload() error {
	k.mu.Lock()
	current := k.pending
	if current == nil {
		current = &load{done: make(chan struct{})}
		k.pending = current
		go k.fetch(current)
	}
	k.mu.Unlock()
	<-current.done
	return current.err
}

func (k *keySet) fetch(current *load) {
	keys, err := k.fetchKeys()
	k.mu.Lock()
	if err == nil {
		k.keys, k.loaded, k.loadedAt = keys, true, k.now()
	}
	k.pending = nil
	current.err = err
	k.mu.Unlock()
	close(current.done)
}

func (k *keySet) fetchKeys() ([]map[string]any, error) {
	status, body, readErr, err := fetchCore(k.client, k.url)
	if err != nil {
		return nil, err
	}
	if status != http.StatusOK {
		return nil, fmt.Errorf("expected 200 OK from the JSON Web Key Set HTTP response, got %d", status)
	}
	if readErr != nil {
		return nil, fmt.Errorf("failed to read the JSON Web Key Set HTTP response: %w", readErr)
	}
	var set struct {
		Keys []json.RawMessage `json:"keys"`
	}
	if err := json.Unmarshal(body, &set); err != nil {
		return nil, fmt.Errorf("failed to parse the JSON Web Key Set HTTP response as JSON: %w", err)
	}
	if set.Keys == nil {
		return nil, errors.New("the JSON Web Key Set HTTP response holds no list of keys")
	}
	keys := make([]map[string]any, 0, len(set.Keys))
	for _, raw := range set.Keys {
		var key map[string]any
		if json.Unmarshal(raw, &key) != nil || key == nil {
			return nil, errors.New("the JSON Web Key Set HTTP response holds a key that isn't an object")
		}
		keys = append(keys, key)
	}
	return keys, nil
}

// keyFor is the Ed25519 key that verifies a token whose header names kid,
// or kid's absence. A token whose key core doesn't serve, after fetching
// the keys again unless it did so in the last keyCooldown, is
// errNoMatchingKey. Any other error is a failure to load the keys.
func (k *keySet) keyFor(kid *string) (ed25519.PublicKey, error) {
	k.mu.Lock()
	loaded := k.loaded
	k.mu.Unlock()
	if !loaded {
		if err := k.reload(); err != nil {
			return nil, err
		}
	}
	key, err := k.match(kid)
	if !errors.Is(err, errNoMatchingKey) {
		return key, err
	}
	k.mu.Lock()
	coolingDown := k.now().Before(k.loadedAt.Add(keyCooldown))
	k.mu.Unlock()
	if coolingDown {
		return nil, err
	}
	if err := k.reload(); err != nil {
		return nil, err
	}
	return k.match(kid)
}

// match picks the key as jose's local key set does: an OKP key on Ed25519
// or Ed448 for EdDSA, with the token's kid if it names one, and no alg, use
// or key_ops that rules it out.
func (k *keySet) match(kid *string) (ed25519.PublicKey, error) {
	k.mu.Lock()
	keys := k.keys
	k.mu.Unlock()
	var candidates []map[string]any
	for _, key := range keys {
		if key["kty"] != "OKP" {
			continue
		}
		if kid != nil && key["kid"] != *kid {
			continue
		}
		if alg, ok := key["alg"].(string); ok && alg != "EdDSA" {
			continue
		}
		if use, ok := key["use"].(string); ok && use != "sig" {
			continue
		}
		if ops, ok := key["key_ops"].([]any); ok && !slices.Contains(ops, any("verify")) {
			continue
		}
		if key["crv"] != "Ed25519" && key["crv"] != "Ed448" {
			continue
		}
		candidates = append(candidates, key)
	}
	switch len(candidates) {
	case 0:
		return nil, errNoMatchingKey
	case 1:
	default:
		return nil, errMultipleKeys
	}
	key := candidates[0]
	if key["crv"] != "Ed25519" {
		// Go has no Ed448. Core signs with Ed25519, so a token whose key
		// is on Ed448 isn't core's.
		return nil, errEd448
	}
	x, _ := key["x"].(string)
	public, err := base64.RawURLEncoding.DecodeString(x)
	if err != nil || len(public) != ed25519.PublicKeySize {
		return nil, errors.New("core's key set holds an Ed25519 key that isn't one")
	}
	return ed25519.PublicKey(public), nil
}
