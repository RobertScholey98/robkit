package fakecore

import (
	"encoding/base64"
	"encoding/json"
	"maps"
	"slices"
	"strings"
	"testing"
)

func TestThumbprintNamesAKeyAsRFC8037Does(t *testing.T) {
	// RFC 8037's appendix A.3: an Ed25519 key's RFC 7638 thumbprint.
	x, _ := base64.RawURLEncoding.DecodeString("11qYAYKxCrfVS_7TyWQHOg7hcvPapiMlrwIaaPcHURo")

	if got := thumbprint(x); got != "kPrK_qmxVWaYVA9wwBF6Iuo3vVzz7TxHCTwXBygrS4k" {
		t.Errorf("got %q", got)
	}
}

func TestKeyServesItsJWKAsCoreDoes(t *testing.T) {
	key := NewKey(t)
	jwk := key.JWK()

	// Core serves { ...publicJwk, kid, alg: "EdDSA", use: "sig" }, and core's
	// contract test, fake-core.db.test.ts, holds TypeScript's fake to it.
	got := slices.Sorted(maps.Keys(jwk))
	if want := []string{"alg", "crv", "kid", "kty", "use", "x"}; !slices.Equal(got, want) {
		t.Errorf("fields %q, want %q", got, want)
	}
	if jwk["kty"] != "OKP" || jwk["crv"] != "Ed25519" || jwk["alg"] != "EdDSA" || jwk["use"] != "sig" {
		t.Errorf("got %v", jwk)
	}
	if jwk["kid"] != thumbprint(key.public) || key.Kid != jwk["kid"] {
		t.Errorf("kid %q, Kid %q, want the thumbprint %q", jwk["kid"], key.Kid, thumbprint(key.public))
	}
}

func TestTokensCarryTheKidTheirKeyServes(t *testing.T) {
	key := NewKey(t)
	header, _, _ := strings.Cut(key.Token(TokenOptions{}), ".")
	data, _ := base64.RawURLEncoding.DecodeString(header)
	var got map[string]any
	if err := json.Unmarshal(data, &got); err != nil {
		t.Fatal(err)
	}

	if got["kid"] != key.JWK()["kid"] || got["alg"] != "EdDSA" {
		t.Errorf("got %v, want the kid %q", got, key.JWK()["kid"])
	}
}
