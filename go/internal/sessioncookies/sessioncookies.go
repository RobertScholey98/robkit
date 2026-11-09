// Package sessioncookies names the cookies a session lives in on one
// install. It ports sessionCookies from @robkit/session, and the guard and
// this module's fake core both use it.
package sessioncookies

import "strings"

// Names are the cookies a session lives in on one install. Every one is
// host-only: Path=/ and no Domain, so only the host that set it gets it.
type Names struct {
	// Session is the session cookie: each app's own on its host.
	Session string
	// State is the guard's state cookie, which ties a trip through core
	// to a browser.
	State string
	// Secure says every one is Secure, as on an https install.
	Secure bool
}

// For is the names on the install at origin, which may be core's origin
// or an app's. On https each is Secure and its name starts with __Host-. A
// browser sets a __Host- cookie only when it is Secure, has Path=/ and
// names no Domain, so an app on a sibling subdomain can't plant one for
// another host. On http, which robkit allows only on a local install, the
// prefix can't be used, so the names are plain. The protocol decides, not
// the domain.
func For(origin string) Names {
	secure := strings.HasPrefix(strings.ToLower(origin), "https://")
	prefix := ""
	if secure {
		prefix = "__Host-"
	}
	return Names{Session: prefix + "robkit_session", State: prefix + "robkit_state", Secure: secure}
}
