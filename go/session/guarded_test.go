package session_test

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"reflect"
	"regexp"
	"slices"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/RobertScholey98/robkit/go/guard"
	"github.com/RobertScholey98/robkit/go/internal/conformance"
	"github.com/RobertScholey98/robkit/go/internal/fakecore"
	"github.com/RobertScholey98/robkit/go/session"
)

var navigate = map[string]string{"sec-fetch-mode": "navigate"}

// clock is a test's time, which it can move on.
type clock struct {
	mu  sync.Mutex
	now time.Time
}

func (c *clock) Now() time.Time {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.now
}

func (c *clock) advance(d time.Duration) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.now = c.now.Add(d)
}

func realClock() *clock { return &clock{now: time.Now()} }

// app is an app behind the guard that answers with its viewer as JSON.
type app struct {
	t       *testing.T
	handler http.Handler
}

// guarded is the app on core, with its options' App, Core and Now filled
// in when left out: App is example, owner-only unless it says.
func guarded(t *testing.T, core *fakecore.Core, options session.Options) app {
	t.Helper()
	if options.App == "" {
		options.App = fakecore.App
	}
	if options.Core == "" {
		options.Core = core.Origin
	}
	wrap, err := session.Guarded(options)
	if err != nil {
		t.Fatal(err)
	}
	return app{t, wrap(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("content-type", "application/json")
		_ = json.NewEncoder(w).Encode(session.ViewerFrom(r.Context()))
	}))}
}

func ownerOnly(t *testing.T, core *fakecore.Core) app {
	t.Helper()
	return guarded(t, core, session.Options{Access: guard.OwnerRule{}})
}

type answer struct {
	status  int
	header  http.Header
	body    string
	cookies []string
}

func (a answer) location() string { return a.header.Get("location") }

// open sends method to target with headers and returns the app's answer.
func (a app) open(method, target string, headers ...map[string]string) answer {
	a.t.Helper()
	r := httptest.NewRequest(method, target, nil)
	for _, h := range headers {
		for name, value := range h {
			r.Header.Add(name, value)
		}
	}
	w := httptest.NewRecorder()
	a.handler.ServeHTTP(w, r)
	res := w.Result()
	body, _ := io.ReadAll(res.Body)
	return answer{res.StatusCode, res.Header, string(body), res.Header.Values("set-cookie")}
}

func (a app) get(target string, headers ...map[string]string) answer {
	a.t.Helper()
	return a.open(http.MethodGet, target, headers...)
}

func cookie(token string) map[string]string {
	return map[string]string{"cookie": "robkit_session=" + token}
}

// cookiesFrom is a Cookie header sending what the answers' Set-Cookies set.
func cookiesFrom(answers ...answer) map[string]string {
	var pairs []string
	for _, a := range answers {
		for _, set := range a.cookies {
			pairs = append(pairs, strings.SplitN(set, ";", 2)[0])
		}
	}
	return map[string]string{"cookie": strings.Join(pairs, "; ")}
}

func with(headers ...map[string]string) map[string]string {
	all := map[string]string{}
	for _, h := range headers {
		for name, value := range h {
			all[name] = value
		}
	}
	return all
}

func viewerJSON(t *testing.T, v guard.Viewer) string {
	t.Helper()
	data, err := json.Marshal(v)
	if err != nil {
		t.Fatal(err)
	}
	return string(data) + "\n"
}

var stateLike = regexp.MustCompile(`^[\w-]{43}$`)

// refreshLocation checks that location sends the browser to core's
// /refresh, back to pageURL, with a state of its own.
func isRefreshLocation(location, pageURL, coreOrigin string) bool {
	prefix := coreOrigin + "/refresh?next=" + url.QueryEscape(pageURL) + "&state="
	return strings.HasPrefix(location, prefix) && stateLike.MatchString(location[len(prefix):])
}

func stateIn(location string) string {
	u, err := url.Parse(location)
	if err != nil {
		return ""
	}
	return u.Query().Get("state")
}

// callbackFor is where core sends the browser back to next's app, as core's
// /refresh does.
func callbackFor(next, state string, token *string) string {
	u, _ := url.Parse(next)
	callback := url.URL{Scheme: u.Scheme, Host: u.Host, Path: "/_robkit/session"}
	q := url.Values{}
	q.Set("next", next)
	q.Set("state", state)
	if token != nil {
		q.Set("token", *token)
	}
	callback.RawQuery = q.Encode()
	return callback.String()
}

func ptr(s string) *string { return &s }

// onApp is path on the app the tests guard, beside the core at coreOrigin
// on its port.
func onApp(coreOrigin, path string) string {
	return strings.Replace(coreOrigin, "//core.", "//"+fakecore.App+".", 1) + path
}

func loginLocation(core *fakecore.Core, pageURL string) string {
	return core.Hub + "/?next=" + url.QueryEscape(pageURL)
}

func TestGuardOnAPageLoadConformance(t *testing.T) {
	for _, c := range conformance.Cases(t) {
		t.Run(c.Name, func(t *testing.T) {
			core := fakecore.Start(t)
			open := guarded(t, core, session.Options{Access: c.Rule})
			headers := with(navigate)
			if cookie := core.CookieFor(c, fakecore.App); cookie != "" {
				headers["cookie"] = cookie
			}

			res := open.get(core.Page, headers)

			switch c.Outcome {
			case "allow":
				var want guard.Viewer
				switch c.Session {
				case "signed-out":
					want = guard.Nobody{}
				case "owner":
					want = guard.Owner{ID: "owner-1"}
				case "guest":
					roles := c.GuestRoles
					if roles == nil {
						roles = []guard.RoleID{}
					}
					want = guard.Guest{ID: "code-1", Roles: roles}
				}
				if res.status != 200 || res.location() != "" || res.body != viewerJSON(t, want) {
					t.Errorf("got %d %q %s, want 200 and %s", res.status, res.location(), res.body, viewerJSON(t, want))
				}
			case "login":
				if res.status != 302 || res.location() != loginLocation(core, core.Page) {
					t.Errorf("got %d %q, want a login redirect", res.status, res.location())
				}
			case "refresh":
				if res.status != 302 || !isRefreshLocation(res.location(), core.Page, core.Origin) {
					t.Errorf("got %d %q, want a refresh redirect", res.status, res.location())
				}
			case "not-found":
				if res.status != 404 || res.location() != "" || res.body != "Not found" {
					t.Errorf("got %d %q %q, want 404", res.status, res.location(), res.body)
				}
			}
		})
	}
}

func TestGuardOnTheAppsOwnAddress(t *testing.T) {
	for _, c := range conformance.AddressCases(t) {
		t.Run(c.Name, func(t *testing.T) {
			open := guarded(t, nil, session.Options{Access: guard.OwnerRule{}, Core: c.Core})
			r := httptest.NewRequest(http.MethodGet, c.Target, nil)
			r.Host = c.Headers["host"]
			for name, value := range c.Headers {
				if name != "host" {
					r.Header.Set(name, value)
				}
			}
			r.Header.Set("sec-fetch-mode", "navigate")
			if c.SignedOut {
				r.Header.Set("cookie", fakecore.SignedOutCookie())
			}
			w := httptest.NewRecorder()

			open.handler.ServeHTTP(w, r)

			location := w.Header().Get("location")
			hub := strings.Replace(c.Core, "//core.", "//hub.", 1)
			sent := isRefreshLocation(location, c.Next, c.Core)
			if c.SignedOut {
				sent = location == hub+"/?next="+url.QueryEscape(c.Next)
			}
			if w.Code != 302 || !sent {
				t.Errorf("got %d %q, want the browser sent on with next %q", w.Code, location, c.Next)
			}
		})
	}
}

func TestGuardTreatsATokenCoreDidntSignAsNoToken(t *testing.T) {
	core := fakecore.Start(t)
	forger := fakecore.NewKey(t, "key-1")

	res := ownerOnly(t, core).get(core.Page, navigate, cookie(forger.Token(fakecore.TokenOptions{})))

	if res.status != 302 || !isRefreshLocation(res.location(), core.Page, core.Origin) {
		t.Errorf("got %d %q, want a refresh redirect", res.status, res.location())
	}
}

func TestGuardLetsTheViewerThroughToTheHandler(t *testing.T) {
	core := fakecore.Start(t)

	res := ownerOnly(t, core).get(core.Page, navigate, cookie(core.Key.Token(fakecore.TokenOptions{})))

	if res.status != 200 || res.body != `{"kind":"owner","id":"owner-1"}`+"\n" {
		t.Errorf("got %d %s", res.status, res.body)
	}
}

func TestGuardKeepsAnHTTPSInstallsPagesOnHTTPSAndSetsSecureCookiesOffLocalhost(t *testing.T) {
	notes := guarded(t, nil, session.Options{App: "notes", Access: guard.OwnerRule{}, Core: "https://core.example.com"})

	res := notes.get("http://notes.example.com/", navigate)

	if !isRefreshLocation(res.location(), "https://notes.example.com/", "https://core.example.com") {
		t.Errorf("location = %q", res.location())
	}
	secure := regexp.MustCompile(`^robkit_state=[\w-]{43}; Path=/; Max-Age=600; HttpOnly; SameSite=Lax; Secure$`)
	if len(res.cookies) != 1 || !secure.MatchString(res.cookies[0]) {
		t.Errorf("cookies = %q", res.cookies)
	}
}

func TestGuardSendsAPageLoadWithoutFetchMetadataToLogInNotRoundCore(t *testing.T) {
	core := fakecore.Start(t)

	res := ownerOnly(t, core).get(core.Page, map[string]string{"accept": "text/html,application/xhtml+xml,*/*;q=0.8"})

	if res.status != 302 || res.location() != loginLocation(core, core.Page) {
		t.Errorf("got %d %q", res.status, res.location())
	}
}

func TestGuardSendsAPageLoadItHoldsNothingForToCoreKeepingAState(t *testing.T) {
	core := fakecore.Start(t)

	res := ownerOnly(t, core).get(core.Page, navigate)

	state := stateIn(res.location())
	want := []string{"robkit_state=" + state + "; Path=/; Max-Age=600; HttpOnly; SameSite=Lax"}
	if res.status != 302 || res.header.Get("cache-control") != "no-store" || !slices.Equal(res.cookies, want) {
		t.Errorf("got %d %q %q", res.status, res.header.Get("cache-control"), res.cookies)
	}
}

func TestGuardKeepsTheTokenCoreHandsBackThenLetsTheViewerIn(t *testing.T) {
	core := fakecore.Start(t)
	open := ownerOnly(t, core)
	away := open.get(core.Page, navigate)
	token := core.Key.Token(fakecore.TokenOptions{})

	back := open.get(callbackFor(core.Page, stateIn(away.location()), &token), navigate, cookiesFrom(away))
	later := open.get(core.Page, navigate, cookiesFrom(away, back))

	if back.status != 302 || back.location() != core.Page {
		t.Errorf("back: %d %q", back.status, back.location())
	}
	if back.header.Get("cache-control") != "no-store" || back.header.Get("referrer-policy") != "no-referrer" {
		t.Errorf("back headers: %v", back.header)
	}
	if want := []string{"robkit_session=" + token + "; Path=/; Max-Age=2592000; HttpOnly; SameSite=Lax"}; !slices.Equal(back.cookies, want) {
		t.Errorf("back cookies: %q", back.cookies)
	}
	if later.status != 200 || later.body != `{"kind":"owner","id":"owner-1"}`+"\n" {
		t.Errorf("later: %d %s", later.status, later.body)
	}
}

func TestGuardKeepsCoresWordThatNobodyIsSignedIn(t *testing.T) {
	core := fakecore.Start(t)
	asked := func(rule guard.AccessRule) (answer, answer) {
		open := guarded(t, core, session.Options{Access: rule})
		away := open.get(core.Page, navigate)
		back := open.get(callbackFor(core.Page, stateIn(away.location()), nil), navigate, cookiesFrom(away))
		return back, open.get(core.Page, navigate, cookiesFrom(away, back))
	}

	openBack, openThen := asked(guard.OpenRule{})
	_, gatedThen := asked(guard.OwnerRule{})

	word := regexp.MustCompile(`^robkit_session=signed-out\.\d+; Path=/; Max-Age=2592000; HttpOnly; SameSite=Lax$`)
	if len(openBack.cookies) != 1 || !word.MatchString(openBack.cookies[0]) {
		t.Errorf("open back cookies: %q", openBack.cookies)
	}
	if openThen.status != 200 || openThen.body != `{"kind":"nobody"}`+"\n" {
		t.Errorf("open then: %d %s", openThen.status, openThen.body)
	}
	if gatedThen.status != 302 || gatedThen.location() != loginLocation(core, core.Page) {
		t.Errorf("gated then: %d %q", gatedThen.status, gatedThen.location())
	}
	if want := []string{"robkit_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax"}; !slices.Equal(gatedThen.cookies, want) {
		t.Errorf("gated then cookies: %q", gatedThen.cookies)
	}
}

func TestGuardAsksCoreAgainOnceItsWordIsAMinuteOld(t *testing.T) {
	core := fakecore.Start(t)
	now := realClock()
	open := guarded(t, core, session.Options{Access: guard.OpenRule{}, Now: now.Now})
	word := map[string]string{"cookie": fakecore.SignedOutCookie()}
	now.advance(61 * time.Second)

	pageLoad := open.get(core.Page, navigate, word)
	call := open.open(http.MethodPost, core.Page, map[string]string{"sec-fetch-mode": "cors"}, word)

	if pageLoad.status != 302 || !isRefreshLocation(pageLoad.location(), core.Page, core.Origin) {
		t.Errorf("page load: %d %q", pageLoad.status, pageLoad.location())
	}
	if call.status != 200 || call.body != `{"kind":"nobody"}`+"\n" {
		t.Errorf("call: %d %s", call.status, call.body)
	}
}

func TestGuardReusesTheStateItHolds(t *testing.T) {
	core := fakecore.Start(t)
	open := ownerOnly(t, core)
	first := open.get(core.Page, navigate)
	state := stateIn(first.location())

	second := open.get(core.Page, navigate, cookiesFrom(first))

	if stateIn(second.location()) != state || len(second.cookies) != 1 || !strings.HasPrefix(second.cookies[0], "robkit_state="+state+";") {
		t.Errorf("second: %q %q, want state %s", second.location(), second.cookies, state)
	}
}

func TestGuardRefusesATokenSentToItsCallbackByALinkTheBrowserDidntStart(t *testing.T) {
	for name, held := range map[string]string{
		"no state cookie": "",
		"another state":   "robkit_state=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
	} {
		t.Run(name, func(t *testing.T) {
			core := fakecore.Start(t)
			attacker := core.Key.Token(fakecore.TokenOptions{Holder: fakecore.Guest("family")})

			res := ownerOnly(t, core).get(
				callbackFor(core.Page, "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB", &attacker),
				navigate, map[string]string{"cookie": held},
			)

			if res.status != 400 || len(res.cookies) != 0 {
				t.Errorf("got %d %q", res.status, res.cookies)
			}
		})
	}
}

func TestGuardRefusesAtItsCallbackATokenForAnotherAudience(t *testing.T) {
	for name, audience := range map[string]string{"another app": "diary", "core": "core"} {
		t.Run(name, func(t *testing.T) {
			core := fakecore.Start(t)
			open := ownerOnly(t, core)
			away := open.get(core.Page, navigate)
			token := core.Key.Token(fakecore.TokenOptions{Audience: audience})

			res := open.get(callbackFor(core.Page, stateIn(away.location()), &token), navigate, cookiesFrom(away))

			if res.status != 400 || res.body != "Core's token for this app doesn't check out." || len(res.cookies) != 0 {
				t.Errorf("got %d %q %q", res.status, res.body, res.cookies)
			}
		})
	}
}

func TestGuardGoesOnOnlyToAPageOnTheSameApp(t *testing.T) {
	for _, next := range []string{
		"http://diary.robkit.localhost:PORT/",
		"https://evil.com/",
		"http://example.robkit.localhost:PORT/_robkit/session",
		"/relative",
	} {
		t.Run(next, func(t *testing.T) {
			core := fakecore.Start(t)
			next := strings.Replace(next, ":PORT", core.Origin[strings.LastIndex(core.Origin, ":"):], 1)
			open := ownerOnly(t, core)
			away := open.get(core.Page, navigate)
			token := core.Key.Token(fakecore.TokenOptions{})
			callback, _ := url.Parse(callbackFor(core.Page, stateIn(away.location()), &token))
			q := callback.Query()
			q.Set("next", next)
			callback.RawQuery = q.Encode()

			back := open.get(callback.String(), navigate, cookiesFrom(away))
			refresh := open.get(onApp(core.Origin, "/_robkit/refresh?next="+url.QueryEscape(next)), navigate)

			if back.status != 400 || refresh.status != 400 || len(back.cookies) != 0 {
				t.Errorf("back %d %q, refresh %d", back.status, back.cookies, refresh.status)
			}
			if back.body != "next must be a page on this app." {
				t.Errorf("back body %q", back.body)
			}
		})
	}
}

func TestGuardStopsAtItsCallbackWhenItsClockRunsAheadOfCores(t *testing.T) {
	core := fakecore.Start(t)
	open := ownerOnly(t, core)
	away := open.get(core.Page, navigate)
	token := core.Key.Token(fakecore.TokenOptions{Age: 20 * time.Minute})

	res := open.get(callbackFor(core.Page, stateIn(away.location()), &token), navigate, cookiesFrom(away))

	if res.status != 503 || len(res.cookies) != 0 {
		t.Errorf("got %d %q", res.status, res.cookies)
	}
}

// lapsed reads the guard's 401 as @robkit/react's sessionFetch does.
func lapsed(t *testing.T, res answer) (outcome, errorText, location string) {
	t.Helper()
	if res.status != 401 {
		t.Fatalf("status %d, want 401", res.status)
	}
	var body struct {
		Error    string `json:"error"`
		Location string `json:"location"`
	}
	if err := json.Unmarshal([]byte(res.body), &body); err != nil {
		t.Fatalf("body %q isn't JSON: %v", res.body, err)
	}
	if res.header.Get("content-type") != "application/json" || res.header.Get("cache-control") != "no-store" {
		t.Errorf("headers %v", res.header)
	}
	return res.header.Get("robkit-session"), body.Error, body.Location
}

func TestGuardAnswersACallWithThe401ThePageReads(t *testing.T) {
	core := fakecore.Start(t)
	open := ownerOnly(t, core)

	loggedOut := open.get(core.Page, map[string]string{"sec-fetch-mode": "cors"})
	expired := open.open(http.MethodPost, core.Page, cookie(core.Key.Token(fakecore.TokenOptions{Age: 20 * time.Minute})))

	if o, e, l := lapsed(t, loggedOut); o != "login" || e != "Sign in to use this app." || l != core.Hub+"/" {
		t.Errorf("logged out: %q %q %q", o, e, l)
	}
	if want := []string{"robkit_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax"}; !slices.Equal(loggedOut.cookies, want) {
		t.Errorf("logged out cookies: %q", loggedOut.cookies)
	}
	if o, e, l := lapsed(t, expired); o != "refresh" || e != "Your session needs refreshing." || l != onApp(core.Origin, "/_robkit/refresh") {
		t.Errorf("expired: %q %q %q", o, e, l)
	}
	if expired.body != `{"error":"Your session needs refreshing.","location":"`+onApp(core.Origin, "/_robkit/refresh")+`"}` {
		t.Errorf("expired body: %s", expired.body)
	}
}

func TestGuardSendsTheBrowserThePageSendsToItsRefreshPathThroughCoreAndBack(t *testing.T) {
	core := fakecore.Start(t)
	open := ownerOnly(t, core)
	expired := open.open(http.MethodPost, core.Page, cookie(core.Key.Token(fakecore.TokenOptions{Age: 20 * time.Minute})))
	_, _, location := lapsed(t, expired)
	leaveFor, _ := url.Parse(location)
	leaveFor.RawQuery = url.Values{"next": {core.Page}}.Encode()

	away := open.get(leaveFor.String(), navigate)
	token := core.Key.Token(fakecore.TokenOptions{})
	back := open.get(callbackFor(core.Page, stateIn(away.location()), &token), navigate, cookiesFrom(away))

	if away.status != 302 || !isRefreshLocation(away.location(), core.Page, core.Origin) {
		t.Errorf("away: %d %q", away.status, away.location())
	}
	if back.status != 302 || back.location() != core.Page {
		t.Errorf("back: %d %q", back.status, back.location())
	}
}

func TestGuardAnswersAServersJSONRequestWithThe401(t *testing.T) {
	core := fakecore.Start(t)

	res := ownerOnly(t, core).get(core.Page, map[string]string{"accept": "application/json"})

	if outcome, _, _ := lapsed(t, res); outcome != "login" {
		t.Errorf("outcome %q", outcome)
	}
}

func TestGuardLetsAServersCallToAnOpenAppInAsNobody(t *testing.T) {
	core := fakecore.Start(t)

	res := guarded(t, core, session.Options{Access: guard.OpenRule{}}).get(core.Page, map[string]string{"accept": "application/json"})

	if res.status != 200 || res.body != `{"kind":"nobody"}`+"\n" {
		t.Errorf("got %d %s", res.status, res.body)
	}
}

func coreHost(core *fakecore.Core) string {
	u, _ := url.Parse(core.Origin)
	return u.Host
}

func TestGuardFetchesCoresKeyOnceKeepingCoresHost(t *testing.T) {
	core := fakecore.Start(t)
	open := ownerOnly(t, core)

	for range 3 {
		if res := open.get(core.Page, navigate, cookie(core.Key.Token(fakecore.TokenOptions{}))); res.status != 200 {
			t.Fatalf("got %d", res.status)
		}
	}

	if want := []string{coreHost(core) + " /.well-known/jwks.json"}; !slices.Equal(core.Fetched(), want) {
		t.Errorf("fetched %q", core.Fetched())
	}
}

func TestGuardChecksTokensAgainstTheConfiguredCoreWhateverPortTheHostNames(t *testing.T) {
	core, attacker := fakecore.Start(t), fakecore.Start(t)
	attacked := "http://example.robkit.localhost:" + strings.Split(coreHost(attacker), ":")[1] + "/"

	res := ownerOnly(t, core).get(attacked, navigate, cookie(attacker.Key.Token(fakecore.TokenOptions{})))

	if res.status != 302 || !isRefreshLocation(res.location(), onApp(core.Origin, "/"), core.Origin) {
		t.Errorf("got %d %q", res.status, res.location())
	}
	if len(attacker.Fetched()) != 0 || len(core.Fetched()) != 1 {
		t.Errorf("attacker fetched %q, core fetched %q", attacker.Fetched(), core.Fetched())
	}
}

func TestGuardAnswers503WhenItCantFetchCoresKey(t *testing.T) {
	core := fakecore.Start(t)
	core.SetStatus(503)

	res := ownerOnly(t, core).get(core.Page, navigate, cookie(core.Key.Token(fakecore.TokenOptions{})))

	if res.status != 503 || res.body != "Can't reach core to check your session." {
		t.Errorf("got %d %q", res.status, res.body)
	}
	if res.header.Get("cache-control") != "no-store" || res.header.Get("content-type") != "text/plain; charset=UTF-8" {
		t.Errorf("headers %v", res.header)
	}
}

func TestGuardKeepsLettingTheOwnerInOnACachedKeyOnceCoreStopsAnswering(t *testing.T) {
	core := fakecore.Start(t)
	now := realClock()
	open := guarded(t, core, session.Options{Access: guard.OwnerRule{}, Now: now.Now})
	first := open.get(core.Page, navigate, cookie(core.Key.Token(fakecore.TokenOptions{Now: now.Now()})))
	core.SetStatus(503)
	now.advance(time.Hour)

	later := open.get(core.Page, navigate, cookie(core.Key.Token(fakecore.TokenOptions{Now: now.Now()})))

	if first.status != 200 || later.status != 200 || len(core.Fetched()) != 1 {
		t.Errorf("first %d, later %d, fetched %q", first.status, later.status, core.Fetched())
	}
}

func TestGuardFetchesCoresKeysAgainForATokenWithAKeyItDoesntHold(t *testing.T) {
	core := fakecore.Start(t)
	now := realClock()
	open := guarded(t, core, session.Options{Access: guard.OwnerRule{}, Now: now.Now})
	open.get(core.Page, navigate, cookie(core.Key.Token(fakecore.TokenOptions{Now: now.Now()})))
	rotated := fakecore.NewKey(t, "key-2")
	core.Rotate(rotated)
	now.advance(31 * time.Second)

	res := open.get(core.Page, navigate, cookie(rotated.Token(fakecore.TokenOptions{Now: now.Now()})))

	if res.status != 200 || len(core.Fetched()) != 2 {
		t.Errorf("got %d, fetched %q", res.status, core.Fetched())
	}
}

func TestGuardWaitsHalfAMinuteBeforeFetchingCoresKeysAgain(t *testing.T) {
	core := fakecore.Start(t)
	now := realClock()
	open := guarded(t, core, session.Options{Access: guard.OwnerRule{}, Now: now.Now})
	open.get(core.Page, navigate, cookie(core.Key.Token(fakecore.TokenOptions{Now: now.Now()})))
	stranger := fakecore.NewKey(t, "key-2")

	for range 3 {
		res := open.get(core.Page, navigate, cookie(stranger.Token(fakecore.TokenOptions{Now: now.Now()})))
		if res.status != 302 {
			t.Errorf("got %d, want the refresh redirect", res.status)
		}
	}

	if len(core.Fetched()) != 1 {
		t.Errorf("fetched %q", core.Fetched())
	}
}

func TestGuardReadsTokensAsCoreSignsThem(t *testing.T) {
	core := fakecore.Start(t)
	now := realClock()
	open := guarded(t, core, session.Options{Access: guard.OpenRule{}, Now: now.Now})
	nobody := `{"kind":"nobody"}` + "\n"
	for name, tc := range map[string]struct {
		options fakecore.TokenOptions
		want    string
	}{
		"a guest with roles":              {fakecore.TokenOptions{Holder: fakecore.Guest("family", "friends")}, `{"kind":"guest","id":"code-1","roles":["family","friends"]}` + "\n"},
		"a token that names no one":       {fakecore.TokenOptions{Claims: map[string]any{"sub": nil}}, nobody},
		"a guest without a list of roles": {fakecore.TokenOptions{Holder: fakecore.Guest(), Claims: map[string]any{"roles": nil}}, nobody},
		"a guest with an empty role":      {fakecore.TokenOptions{Holder: fakecore.Guest(""), Claims: nil}, nobody},
		"a guest with an empty code id":   {fakecore.TokenOptions{Holder: fakecore.Holder{Kind: "guest", Roles: []string{}}}, nobody},
		"someone neither owner nor guest": {fakecore.TokenOptions{Claims: map[string]any{"kind": "admin"}}, nobody},
		"a token for core":                {fakecore.TokenOptions{Audience: "core"}, nobody},
		"a token for several audiences":   {fakecore.TokenOptions{Claims: map[string]any{"aud": []string{"example"}}}, nobody},
		"another algorithm":               {fakecore.TokenOptions{Header: map[string]any{"alg": "HS256"}}, nobody},
		"a critical header":               {fakecore.TokenOptions{Header: map[string]any{"crit": []string{"exp"}, "exp": 1}}, nobody},
		"a token not yet valid":           {fakecore.TokenOptions{Claims: map[string]any{"nbf": now.Now().Unix() + 60}}, nobody},
		"an expiry that isn't a number":   {fakecore.TokenOptions{Claims: map[string]any{"exp": "soon"}}, nobody},
		"a token with no expiry":          {fakecore.TokenOptions{Claims: map[string]any{"exp": nil}}, `{"kind":"owner","id":"owner-1"}` + "\n"},
	} {
		t.Run(name, func(t *testing.T) {
			tc.options.Now = now.Now()
			res := open.open(http.MethodPost, core.Page, cookie(core.Key.Token(tc.options)))
			if res.status != 200 || res.body != tc.want {
				t.Errorf("got %d %s, want %s", res.status, res.body, tc.want)
			}
		})
	}
}

func TestGuardReadsSomethingThatIsntATokenAsNoToken(t *testing.T) {
	core := fakecore.Start(t)
	open := guarded(t, core, session.Options{Access: guard.OpenRule{}})
	token := core.Key.Token(fakecore.TokenOptions{})
	parts := strings.Split(token, ".")

	for _, value := range []string{
		"not-a-token",
		"a.b.c",
		parts[0] + "." + parts[1],
		parts[0] + "." + parts[1] + "." + parts[2] + "x",
		parts[0] + "=." + parts[1] + "." + parts[2],
		core.Key.Sign(map[string]any{"alg": "EdDSA", "kid": "key-1"}, "a string"),
		core.Key.Sign("a string", map[string]any{}),
	} {
		res := open.open(http.MethodPost, core.Page, cookie(value))
		if res.status != 200 || res.body != `{"kind":"nobody"}`+"\n" {
			t.Errorf("%s: got %d %s", value, res.status, res.body)
		}
	}
}

func TestGuardReadsEverySessionCookieTheRequestSends(t *testing.T) {
	core := fakecore.Start(t)
	other := core.Key.Token(fakecore.TokenOptions{Audience: "diary"})
	mine := core.Key.Token(fakecore.TokenOptions{})

	res := ownerOnly(t, core).get(core.Page, navigate, map[string]string{
		"cookie": "theme=dark; robkit_session=" + other + "; robkit_session=" + mine,
	})

	if res.status != 200 {
		t.Errorf("got %d", res.status)
	}
}

func TestGuardLetsInOnlyTheGuestsHoldingARoleCoreGatesTheAppTo(t *testing.T) {
	core := fakecore.Start(t)
	core.SetRule("example", `{"kind":"roles","roles":["family"]}`)
	open := guarded(t, core, session.Options{})
	asGuest := func(roles ...string) answer {
		return open.get(core.Page, navigate, cookie(core.Key.Token(fakecore.TokenOptions{Holder: fakecore.Guest(roles...)})))
	}

	inFamily := asGuest("family")
	friends := asGuest("friends")

	if inFamily.status != 200 || friends.status != 404 {
		t.Errorf("family %d, friends %d", inFamily.status, friends.status)
	}
	if inFamily.body != `{"kind":"guest","id":"code-1","roles":["family"]}`+"\n" {
		t.Errorf("body %s", inFamily.body)
	}
	var accessFetches []string
	for _, f := range core.Fetched() {
		if strings.HasSuffix(f, "/access") {
			accessFetches = append(accessFetches, f)
		}
	}
	if want := []string{coreHost(core) + " /apps/example/access"}; !slices.Equal(accessFetches, want) {
		t.Errorf("fetched %q", accessFetches)
	}
}

func TestGuardKeepsTheRuleForAMinuteThenReadsItAgain(t *testing.T) {
	core := fakecore.Start(t)
	core.SetRule("example", `{"kind":"owner"}`)
	now := realClock()
	open := guarded(t, core, session.Options{Now: now.Now})
	asGuest := func() int {
		return open.get(core.Page, navigate, cookie(core.Key.Token(fakecore.TokenOptions{Holder: fakecore.Guest(), Now: now.Now()}))).status
	}

	first := asGuest()
	core.SetRule("example", `{"kind":"open"}`)
	now.advance(59 * time.Second)
	cached := asGuest()
	now.advance(time.Second)
	reread := asGuest()

	if got := []int{first, cached, reread}; !slices.Equal(got, []int{404, 404, 200}) {
		t.Errorf("got %v", got)
	}
}

func TestGuardAsksCoreOnceForRequestsThatArriveTogether(t *testing.T) {
	core := fakecore.Start(t)
	core.SetRule("example", `{"kind":"open"}`)
	open := guarded(t, core, session.Options{})

	var wg sync.WaitGroup
	for range 5 {
		wg.Go(func() { open.open(http.MethodPost, core.Page) })
	}
	wg.Wait()

	if len(core.Fetched()) != 1 {
		t.Errorf("fetched %q", core.Fetched())
	}
}

func TestGuardTriesAgainAfterFailingToLoadTheRule(t *testing.T) {
	core := fakecore.Start(t)
	open := guarded(t, core, session.Options{OnUnavailable: func(session.Fault) {}})
	failed := open.open(http.MethodPost, core.Page)
	core.SetRule("example", `{"kind":"open"}`)

	later := open.open(http.MethodPost, core.Page)

	if failed.status != 503 || later.status != 200 {
		t.Errorf("failed %d, later %d", failed.status, later.status)
	}
}

func TestGuardAnswers503WhenItCantLoadItsRule(t *testing.T) {
	core := fakecore.Start(t)

	res := guarded(t, core, session.Options{OnUnavailable: func(session.Fault) {}}).get(core.Page, navigate,
		cookie(core.Key.Token(fakecore.TokenOptions{Holder: fakecore.Guest("family")})))

	if res.status != 503 || res.body != "Can't reach core to check who may open this app." {
		t.Errorf("got %d %q", res.status, res.body)
	}
}

// unavailable is the guard's status on core for a guest's page load, with
// each fault it handed OnUnavailable.
func unavailable(t *testing.T, coreOrigin string, key *fakecore.Key) (int, []session.Fault) {
	t.Helper()
	var faults []session.Fault
	open := guarded(t, nil, session.Options{Core: coreOrigin, OnUnavailable: func(f session.Fault) { faults = append(faults, f) }})
	res := open.get(onApp(coreOrigin, "/"), navigate, cookie(key.Token(fakecore.TokenOptions{Holder: fakecore.Guest("family")})))
	return res.status, faults
}

type described struct{ app, failed, reason, cause string }

func describe(faults []session.Fault) []described {
	var all []described
	for _, f := range faults {
		all = append(all, described{f.App, string(f.Failed), string(f.Reason), f.Cause.Error()})
	}
	return all
}

func TestGuardNamesAnAppCoreDoesntKnow(t *testing.T) {
	core := fakecore.Start(t)

	status, faults := unavailable(t, core.Origin, core.Key)

	want := []described{{"example", "access-rule", "unknown-app", "Core doesn't know an app called example."}}
	if status != 503 || !reflect.DeepEqual(describe(faults), want) {
		t.Errorf("got %d %+v", status, describe(faults))
	}
}

func TestGuardNamesARuleCoreSentThatIsntOne(t *testing.T) {
	core := fakecore.Start(t)
	core.SetRule("example", `{"kind":"everyone"}`)

	status, faults := unavailable(t, core.Origin, core.Key)

	want := []described{{"example", "access-rule", "bad-answer", "Core sent an access rule for example that isn't one."}}
	if status != 503 || !reflect.DeepEqual(describe(faults), want) {
		t.Errorf("got %d %+v", status, describe(faults))
	}
	if cause := errors.Unwrap(faults[0].Cause); cause == nil || !strings.Contains(cause.Error(), `{"kind":"everyone"} isn't an access rule.`) {
		t.Errorf("cause %v", cause)
	}
}

func TestGuardNamesABodyThatIsntJSON(t *testing.T) {
	core := fakecore.Start(t)
	core.SetRule("example", `{not json`)

	_, faults := unavailable(t, core.Origin, core.Key)

	want := []described{{"example", "access-rule", "invalid-json", "Core's answer for example's access rule isn't JSON."}}
	if !reflect.DeepEqual(describe(faults), want) || errors.Unwrap(faults[0].Cause) == nil {
		t.Errorf("got %+v", describe(faults))
	}
}

func TestGuardNamesCoreAnsweringWithAnError(t *testing.T) {
	core := fakecore.Start(t)
	core.SetStatus(500)
	var faults []session.Fault
	gated := guarded(t, core, session.Options{OnUnavailable: func(f session.Fault) { faults = append(faults, f) }})

	gated.get(core.Page, navigate)

	want := []described{{"example", "access-rule", "bad-answer", "Core answered 500 for example's access rule."}}
	if !reflect.DeepEqual(describe(faults), want) {
		t.Errorf("got %+v", describe(faults))
	}
}

func TestGuardNamesABodyCutOffPartWay(t *testing.T) {
	cutOff := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("content-length", "100")
		w.WriteHeader(200)
		_, _ = w.Write([]byte(`{"kin`))
	}))
	t.Cleanup(cutOff.Close)
	var faults []session.Fault
	coreOrigin := "http://core.robkit.localhost:" + strings.Split(cutOff.URL, ":")[2]
	open := guarded(t, nil, session.Options{
		Core:          coreOrigin,
		OnUnavailable: func(f session.Fault) { faults = append(faults, f) },
	})

	res := open.open(http.MethodPost, onApp(coreOrigin, "/"))

	want := []described{{"example", "access-rule", "interrupted-body", "Core's answer for example's access rule broke off before its end."}}
	if res.status != 503 || !reflect.DeepEqual(describe(faults), want) || errors.Unwrap(faults[0].Cause) == nil {
		t.Errorf("got %d %+v", res.status, describe(faults))
	}
}

func TestGuardNamesCoreBeingDownAndKeepsTheNetworksOwnError(t *testing.T) {
	down := "http://core.robkit.localhost:1"
	core := fakecore.Start(t)

	status, faults := unavailable(t, down, core.Key)

	want := []described{{"example", "network", "", "Can't reach core at " + down + "."}}
	if status != 503 || !reflect.DeepEqual(describe(faults), want) || errors.Unwrap(faults[0].Cause) == nil {
		t.Errorf("got %d %+v", status, describe(faults))
	}
}

func TestGuardNamesCoreBeingDownWhenItLoadsTheRule(t *testing.T) {
	var faults []session.Fault
	open := guarded(t, nil, session.Options{
		Core:          "http://core.robkit.localhost:1",
		OnUnavailable: func(f session.Fault) { faults = append(faults, f) },
	})

	// With no cookie, there is no token to check against core's key.
	res := open.get(onApp("http://core.robkit.localhost:1", "/"), navigate)

	if res.status != 503 || len(faults) != 1 || faults[0].Failed != session.FailedNetwork {
		t.Errorf("got %d %+v", res.status, describe(faults))
	}
}

func TestGuardNamesCoresKeyWhenCoreAnswersButItsKeySetWontLoad(t *testing.T) {
	core := fakecore.Start(t)
	core.SetStatus(503)

	status, faults := unavailable(t, core.Origin, core.Key)

	if status != 503 || len(faults) != 1 || faults[0].Failed != session.FailedCoreKey {
		t.Errorf("got %d %+v", status, describe(faults))
	}
}

func TestGuardSpeaksTLSToAnHTTPSCore(t *testing.T) {
	core := fakecore.Start(t)
	tls := strings.Replace(core.Origin, "http://", "https://", 1)

	status, faults := unavailable(t, tls, core.Key)

	if status != 503 || len(faults) != 1 || faults[0].Failed != session.FailedNetwork || len(core.Fetched()) != 0 {
		t.Errorf("got %d %+v, core fetched %q", status, describe(faults), core.Fetched())
	}
}

func TestGuardRefusesOptionsThatWontDo(t *testing.T) {
	for _, tc := range []struct {
		options session.Options
		want    string
	}{
		{session.Options{App: "Notes", Core: "http://core.robkit.localhost:3000"}, `"Notes" can't be an app's slug`},
		{session.Options{App: "notes", Core: "http://hub.robkit.localhost:3000"}, `"http://hub.robkit.localhost:3000", which isn't core's address`},
		{session.Options{App: "notes", Core: "http://core.robkit.localhost:3000/x"}, `which isn't core's address`},
	} {
		_, err := session.Guarded(tc.options)
		if err == nil || !strings.Contains(err.Error(), tc.want) {
			t.Errorf("Guarded(%+v) = %v, want %q", tc.options, err, tc.want)
		}
	}
}

func TestReadGuardEnv(t *testing.T) {
	env := func(vars map[string]string) func(string) string {
		return func(name string) string { return vars[name] }
	}

	options, err := session.ReadGuardEnv(env(map[string]string{
		"ROBKIT_APP":      "notes",
		"ROBKIT_CORE_URL": "https://core.robkit.dev/",
	}))
	_, missing := session.ReadGuardEnv(env(nil))

	if err != nil || options.App != "notes" || options.Core != "https://core.robkit.dev" {
		t.Errorf("got %+v, %v", options, err)
	}
	want := "ROBKIT_APP is not set. Run the app with pnpm dev, which sets it to the app's slug.\n" +
		"ROBKIT_CORE_URL is not set. Run the app with pnpm dev, which sets it, or set it to core's public origin, such as https://core.robkit.dev."
	if missing == nil || missing.Error() != want {
		t.Errorf("missing: %v", missing)
	}
}

func TestViewerFromPanicsOutsideTheGuard(t *testing.T) {
	defer func() {
		if recover() == nil {
			t.Error("ViewerFrom didn't panic")
		}
	}()
	session.ViewerFrom(httptest.NewRequest(http.MethodGet, "/", nil).Context())
}

func TestWithViewerHandsAHandlerAViewer(t *testing.T) {
	ctx := session.WithViewer(httptest.NewRequest(http.MethodGet, "/", nil).Context(), guard.Owner{ID: "owner-1"})

	if got := session.ViewerFrom(ctx); got != (guard.Owner{ID: "owner-1"}) {
		t.Errorf("got %#v", got)
	}
}

func TestDefaultOnUnavailableReportsTheAppWhatFailedAndTheCause(t *testing.T) {
	core := fakecore.Start(t)
	var log strings.Builder
	session.SetReportOutput(t, &log)

	guarded(t, core, session.Options{}).get(core.Page, navigate)

	want := "robkit guard for example answered 503: couldn't load the app's access rule from core.\nCore doesn't know an app called example.\n"
	if log.String() != want {
		t.Errorf("logged %q", log.String())
	}
}
