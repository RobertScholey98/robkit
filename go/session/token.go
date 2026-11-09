package session

import (
	"crypto/ed25519"
	"encoding/base64"
	"encoding/json"
	"math"
	"strings"
	"time"

	"github.com/RobertScholey98/robkit/go/guard"
)

// appToken is an app token's viewer, once its signature and audience check
// out.
type appToken struct {
	viewer guard.SignedInViewer
	// expired says the token's lifetime has passed; core may still hold
	// the session.
	expired bool
}

// readAppToken checks token's signature against core's keys and that its
// audience is app, and reads who it is for, even once it has expired. A bad
// token, or one for any other audience, core's included, is nil. Failing to
// load the keys is an error, so a caller can tell "not signed in" from
// "can't check". It verifies as jose's jwtVerify does, allowing only EdDSA.
func readAppToken(keys *keySet, token string, now time.Time, app string) (*appToken, error) {
	claims, expired, err := verified(keys, token, now)
	if claims == nil {
		return nil, err
	}
	if audience, ok := claims["aud"].(string); !ok || audience != app {
		return nil, nil
	}
	viewer := viewerIn(claims)
	if viewer == nil {
		return nil, nil
	}
	return &appToken{viewer: viewer, expired: expired}, nil
}

func decodePart(part string) ([]byte, bool) {
	data, err := base64.RawURLEncoding.DecodeString(part)
	return data, err == nil
}

// verified is a token's claims once its signature checks out, even once it
// has expired. A bad token's are nil, with no error.
func verified(keys *keySet, token string, now time.Time) (claims map[string]any, expired bool, err error) {
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return nil, false, nil
	}
	headerJSON, ok := decodePart(parts[0])
	var header map[string]any
	if !ok || json.Unmarshal(headerJSON, &header) != nil || header == nil {
		return nil, false, nil
	}
	if alg, _ := header["alg"].(string); alg != "EdDSA" || !acceptsCritical(header) {
		return nil, false, nil
	}
	var kid *string
	if named, ok := header["kid"].(string); ok {
		kid = &named
	}
	key, err := keys.keyFor(kid)
	if err != nil {
		if isBadToken(err) {
			return nil, false, nil
		}
		return nil, false, err
	}
	signature, ok := decodePart(parts[2])
	if !ok || !ed25519.Verify(key, []byte(parts[0]+"."+parts[1]), signature) {
		return nil, false, nil
	}
	payload, ok := decodePart(parts[1])
	if !ok || json.Unmarshal(payload, &claims) != nil || claims == nil {
		return nil, false, nil
	}
	return checkTimes(claims, now)
}

// acceptsCritical refuses a header that marks an extension critical, or
// leaves the payload unencoded, as jose does for a session token: b64 is
// the only extension it knows, and a token's payload is always encoded.
func acceptsCritical(header map[string]any) bool {
	if b64, present := header["b64"]; present && b64 != true {
		return false
	}
	critical, present := header["crit"]
	if !present {
		return true
	}
	names, ok := critical.([]any)
	if !ok || len(names) == 0 {
		return false
	}
	for _, name := range names {
		if name != "b64" || header["b64"] == nil {
			return false
		}
	}
	return true
}

// checkTimes checks a token's iat, nbf and exp as jose does with exp
// required: a token with no exp, or not yet valid, is bad, and one whose
// exp has come is expired.
func checkTimes(claims map[string]any, now time.Time) (map[string]any, bool, error) {
	seconds := float64(now.Unix())
	number := func(name string) (float64, bool, bool) {
		value, present := claims[name]
		if !present {
			return 0, false, true
		}
		n, ok := value.(float64)
		return n, true, ok && !math.IsNaN(n)
	}
	if _, _, ok := number("iat"); !ok {
		return nil, false, nil
	}
	if nbf, present, ok := number("nbf"); !ok || (present && nbf > seconds) {
		return nil, false, nil
	}
	exp, present, ok := number("exp")
	if !ok || !present {
		return nil, false, nil
	}
	return claims, exp <= seconds, nil
}

// viewerIn is who a token is for: the owner, or a guest by their code's
// id with their roles' ids. A guest's id is their access code's id, never
// the code itself, since apps see it.
func viewerIn(claims map[string]any) guard.SignedInViewer {
	sub, ok := claims["sub"].(string)
	if !ok {
		return nil
	}
	switch claims["kind"] {
	case "owner":
		return guard.Owner{ID: sub}
	case "guest":
		list, ok := claims["roles"].([]any)
		if sub == "" || !ok {
			return nil
		}
		roles := make([]guard.RoleID, 0, len(list))
		for _, role := range list {
			id, ok := role.(string)
			if !ok || id == "" {
				return nil
			}
			roles = append(roles, guard.RoleID(id))
		}
		return guard.Guest{ID: guard.CodeID(sub), Roles: roles}
	}
	return nil
}
