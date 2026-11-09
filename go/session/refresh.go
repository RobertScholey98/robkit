package session

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/RobertScholey98/robkit/go/guard"
	"github.com/RobertScholey98/robkit/go/internal/sessioncookies"
)

const (
	// appSessionPath is the callback where core hands the app its token,
	// or none.
	appSessionPath = "/_robkit/session"
	// appRefreshPath is where a call from the page sends the browser when
	// the app's token has lapsed. It starts the trip through core, as a
	// page load would.
	appRefreshPath = "/_robkit/refresh"
	// stateMaxAge is how long a trip through core may take before its
	// state is forgotten.
	stateMaxAge = 10 * 60
	// appCookieMaxAge outlives the token, as long as core's session lasts,
	// so an expired token still says "refresh" rather than nothing.
	appCookieMaxAge = 30 * 24 * 60 * 60
	// signedOutSeconds is how long the app takes core's word that nobody
	// is signed in.
	signedOutSeconds = 60
	// signedOutPrefix starts the app's cookie when core said nobody is
	// signed in, then the time.
	signedOutPrefix = "signed-out."
	nextNotOnApp    = "next must be a page on this app."
)

var statePattern = regexp.MustCompile(`^[\w-]{43}$`)

// refreshProtocol is how an app gets and keeps its token: the trip through
// core's /refresh and back to the app's callback, with the state that ties
// the two together, and the app's own cookie that holds the token, or
// core's word that nobody is signed in.
type refreshProtocol struct {
	app  string
	core string
	// cookies are the app's cookies: the session cookie that holds its
	// token, or core's word that nobody is signed in, and the state cookie
	// that holds the state it sent core until core comes back.
	cookies        sessioncookies.Names
	keys           *keySet
	now            func() time.Time
	keyUnavailable func(error) response
}

func (p *refreshProtocol) cookie(name, value string, maxAge int) string {
	return hostOnlyCookie(name, value, maxAge, p.cookies.Secure)
}

// forget is a Set-Cookie that forgets core's word that nobody is signed in.
func (p *refreshProtocol) forget() string {
	return p.cookie(p.cookies.Session, "", 0)
}

// stateIn is the state this browser holds for a trip through core, if any.
func (p *refreshProtocol) stateIn(r *http.Request) (string, bool) {
	for _, value := range cookieValues(r, p.cookies.State) {
		if statePattern.MatchString(value) {
			return value, true
		}
	}
	return "", false
}

// toCore sends the browser to core's /refresh, which comes back to the
// app's callback with a token for this app, or none, and the same state.
// Only this browser holds the state, so no one else's link can hand the app
// a token.
func (p *refreshProtocol) toCore(r *http.Request, next string) response {
	state, held := p.stateIn(r)
	if !held {
		random := make([]byte, 32)
		_, _ = rand.Read(random)
		state = base64.RawURLEncoding.EncodeToString(random)
	}
	return redirect(withQuery(p.core+"/refresh", "next", next, "state", state),
		"set-cookie", p.cookie(p.cookies.State, state, stateMaxAge))
}

// toNext sends the browser on to next, a page on the app, with any extra
// headers, each a name and a value. The URL it leaves carries a token or a
// state, so no page it goes to learns that URL as the referrer.
func toNext(next string, extra ...string) response {
	return redirect(next, append(extra, "referrer-policy", "no-referrer")...)
}

// arrive answers core sending the browser back with the app's token, or
// none if nobody is signed in. The guard keeps whichever it got in the
// app's cookie and sends the browser on to next. Each refusal is a page
// rather than a redirect, so a browser that can't keep the cookie stops
// here instead of going round again.
//
// A state that isn't the one the browser holds is a trip another page
// load superseded: two tabs that start together each get a state, and the
// browser keeps the last. The guard stores nothing from it and sends the
// browser on to next, which goes round again with the state it holds.
func (p *refreshProtocol) arrive(r *http.Request, u *url.URL) response {
	next, ok := nextOn(u)
	if !ok {
		return text(nextNotOnApp, http.StatusBadRequest)
	}
	held, ok := p.stateIn(r)
	if !ok {
		return text("This browser didn't keep the app's cookie, so it can't sign you in here. Allow cookies for this site and try again.", http.StatusBadRequest)
	}
	query := u.Query()
	sent, hasState := query["state"]
	if !hasState || subtle.ConstantTimeCompare([]byte(sent[0]), []byte(held)) != 1 {
		return toNext(next)
	}
	value := signedOutPrefix + strconv.FormatInt(p.now().Unix(), 10)
	if tokens, hasToken := query["token"]; hasToken {
		read, err := readAppToken(p.keys, tokens[0], p.now(), p.app)
		if err != nil {
			return p.keyUnavailable(err)
		}
		if read == nil {
			return text("Core's token for this app doesn't check out.", http.StatusBadRequest)
		}
		if read.expired {
			return text("The token core just issued has already expired by this app's clock. Check that the app's clock agrees with core's.", http.StatusServiceUnavailable)
		}
		value = tokens[0]
	}
	return toNext(next, "set-cookie", p.cookie(p.cookies.Session, value, appCookieMaxAge))
}

// answer is the guard's answer to a request for one of its own paths: the
// callback where core hands the app its token, and the refresh path a call
// from the page sends the browser to. False for any other path.
func (p *refreshProtocol) answer(r *http.Request, u *url.URL) (response, bool) {
	switch u.EscapedPath() {
	case appSessionPath:
		return p.arrive(r, u), true
	case appRefreshPath:
		if next, ok := nextOn(u); ok {
			return p.toCore(r, next), true
		}
		return text(nextNotOnApp, http.StatusBadRequest), true
	}
	return response{}, false
}

// signedOutAt is when core said nobody is signed in, if value holds that.
func signedOutAt(value string) (int64, bool) {
	rest, found := strings.CutPrefix(value, signedOutPrefix)
	if !found {
		return 0, false
	}
	at, err := strconv.ParseInt(rest, 10, 64)
	return at, err == nil
}

// sessionOf is what the app's own cookie says about who is asking.
func (p *refreshProtocol) sessionOf(r *http.Request) (guard.SessionState, error) {
	var saidSignedOut *int64
	for _, value := range cookieValues(r, p.cookies.Session) {
		if at, ok := signedOutAt(value); ok {
			if saidSignedOut == nil || at > *saidSignedOut {
				saidSignedOut = &at
			}
			continue
		}
		read, err := readAppToken(p.keys, value, p.now(), p.app)
		if err != nil {
			return nil, err
		}
		if read == nil {
			continue
		}
		if read.expired {
			return guard.Expired{}, nil
		}
		return guard.SignedIn{Viewer: read.viewer}, nil
	}
	if saidSignedOut != nil {
		if age := p.now().Unix() - *saidSignedOut; age >= 0 && age < signedOutSeconds {
			return guard.SignedOut{}, nil
		}
	}
	if isBrowserNavigation(r) {
		return guard.Unknown{}, nil
	}
	return guard.SignedOut{}, nil
}
