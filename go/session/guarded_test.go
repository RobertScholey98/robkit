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
	"strconv"
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
				r.Header.Set("cookie", fakecore.SignedOutCookie(c.Core))
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

func TestGuardOnTheCookiesARequestCarries(t *testing.T) {
	for _, c := range conformance.CookieCases(t) {
		t.Run(c.Name, func(t *testing.T) {
			now := &clock{now: time.Unix(c.Now+1, 0)}
			open := guarded(t, nil, session.Options{Access: guard.OpenRule{}, Core: c.Core, Now: now.Now})
			page := strings.Replace(c.Core, "//core.", "//"+fakecore.App+".", 1) + "/"

			// Go's server hands the header's bytes on as they are.
			res := open.get(page, navigate, map[string]string{"cookie": c.Cookie})

			if c.Reads {
				if res.status != 200 || res.body != `{"kind":"nobody"}`+"\n" {
					t.Errorf("got %d %q, want the browser let in as nobody", res.status, res.body)
				}
			} else if res.status != 302 || !isRefreshLocation(res.location(), page, c.Core) {
				t.Errorf("got %d %q, want the browser sent to core", res.status, res.location())
			}
		})
	}
}

func TestGuardOnARequestFromAnotherOrigin(t *testing.T) {
	for _, c := range conformance.WriteCases(t) {
		t.Run(c.Name, func(t *testing.T) {
			open := guarded(t, nil, session.Options{Access: guard.OpenRule{}, Core: c.Core})
			page := strings.Replace(c.Core, "//core.", "//"+fakecore.App+".", 1) + c.Target

			res := open.open(c.Method, page, c.Headers)

			reached := res.body == `{"kind":"nobody"}`+"\n"
			if c.Refused && (res.status != 403 || reached) {
				t.Errorf("got %d %q, want the guard's 403", res.status, res.body)
			}
			if !c.Refused && (res.status != 200 || !reached) {
				t.Errorf("got %d %q, want the handler as nobody", res.status, res.body)
			}
		})
	}
}

func TestGuardRefusesAnotherOriginWithPlainTextThatSaysWhy(t *testing.T) {
	core := fakecore.Start(t)

	res := ownerOnly(t, core).open(http.MethodPost, core.Page, map[string]string{"sec-fetch-site": "same-site", "origin": core.Hub})

	if res.status != 403 || res.header.Get("content-type") != "text/plain; charset=UTF-8" || res.header.Get("cache-control") != "no-store" ||
		res.body != "This app only accepts changes from its own pages, and this request came from another origin." {
		t.Errorf("got %d %v %q", res.status, res.header, res.body)
	}
}

func TestGuardRefusesAnotherOriginBeforeItReadsTheSession(t *testing.T) {
	core := fakecore.Start(t)
	core.SetStatus(503)

	res := guarded(t, core, session.Options{}).open(http.MethodPost, core.Page, map[string]string{"origin": core.Hub}, cookie(core.Key.Token(fakecore.TokenOptions{})))

	if res.status != 403 || len(core.Fetched()) != 0 {
		t.Errorf("got %d, core asked %q", res.status, core.Fetched())
	}
}

func TestGuardTreatsATokenCoreDidntSignAsNoToken(t *testing.T) {
	core := fakecore.Start(t)
	forger := fakecore.NewKey(t)

	// Naming core's kid, so the guard checks the signature against core's key.
	res := ownerOnly(t, core).get(core.Page, navigate, cookie(forger.Token(fakecore.TokenOptions{Kid: core.Key.Kid})))

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

func TestGuardKeepsAnHTTPSInstallsPagesOnHTTPSAndItsStateInAHostCookie(t *testing.T) {
	notes := guarded(t, nil, session.Options{App: "notes", Access: guard.OwnerRule{}, Core: "https://core.example.com"})

	res := notes.get("http://notes.example.com/", navigate)

	if !isRefreshLocation(res.location(), "https://notes.example.com/", "https://core.example.com") {
		t.Errorf("location = %q", res.location())
	}
	secure := regexp.MustCompile(`^__Host-robkit_state=[\w-]{43}; Path=/; Max-Age=600; HttpOnly; SameSite=Lax; Secure$`)
	if len(res.cookies) != 1 || !secure.MatchString(res.cookies[0]) {
		t.Errorf("cookies = %q", res.cookies)
	}
}

func TestGuardKeepsCoresWordInAHostCookieOnAnHTTPSInstall(t *testing.T) {
	for _, c := range []struct{ core, page string }{
		{"https://core.example.com", "https://notes.example.com/"},
		{"https://core.robkit.localhost:3443", "https://notes.robkit.localhost:3443/"},
	} {
		t.Run(c.core, func(t *testing.T) {
			open := guarded(t, nil, session.Options{App: "notes", Access: guard.OpenRule{}, Core: c.core})
			gated := guarded(t, nil, session.Options{App: "notes", Access: guard.OwnerRule{}, Core: c.core})

			away := open.get(c.page, navigate)
			back := open.get(callbackFor(c.page, stateIn(away.location()), nil), navigate, cookiesFrom(away))
			then := open.get(c.page, navigate, cookiesFrom(away, back))
			login := gated.get(c.page, navigate, cookiesFrom(away, back))

			word := regexp.MustCompile(`^__Host-robkit_session=signed-out\.\d+; Path=/; Max-Age=2592000; HttpOnly; SameSite=Lax; Secure$`)
			if len(back.cookies) != 1 || !word.MatchString(back.cookies[0]) {
				t.Errorf("back cookies: %q", back.cookies)
			}
			if then.status != 200 || then.body != `{"kind":"nobody"}`+"\n" {
				t.Errorf("then: %d %s", then.status, then.body)
			}
			if want := []string{"__Host-robkit_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax; Secure"}; !slices.Equal(login.cookies, want) {
				t.Errorf("login cookies: %q", login.cookies)
			}
		})
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
	word := map[string]string{"cookie": fakecore.SignedOutCookie(core.Origin)}
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

func TestGuardRefusesATokenSentToItsCallbackByABrowserThatHoldsNoState(t *testing.T) {
	core := fakecore.Start(t)
	attacker := core.Key.Token(fakecore.TokenOptions{Holder: fakecore.Guest("family")})

	res := ownerOnly(t, core).get(callbackFor(core.Page, "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB", &attacker), navigate)

	want := "This browser didn't keep the app's cookie, so it can't sign you in here. Allow cookies for this site and try again."
	if res.status != 400 || res.body != want || len(res.cookies) != 0 {
		t.Errorf("got %d %q %q", res.status, res.body, res.cookies)
	}
}

func TestGuardStoresNothingFromASupersededCallbackAndSendsTheBrowserOnToNext(t *testing.T) {
	core := fakecore.Start(t)
	attacker := core.Key.Token(fakecore.TokenOptions{Holder: fakecore.Guest("family")})

	res := ownerOnly(t, core).get(
		callbackFor(core.Page, "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB", &attacker),
		navigate, map[string]string{"cookie": "robkit_state=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"},
	)

	if res.status != 302 || res.location() != core.Page || len(res.cookies) != 0 {
		t.Errorf("got %d %q %q", res.status, res.location(), res.cookies)
	}
	if res.header.Get("cache-control") != "no-store" || res.header.Get("referrer-policy") != "no-referrer" {
		t.Errorf("headers: %v", res.header)
	}
}

func TestGuardTakesTwoPageLoadsStartedTogetherToTheirPages(t *testing.T) {
	for name, order := range map[string][]int{
		"the first tab's callback first":  {0, 1},
		"the second tab's callback first": {1, 0},
	} {
		t.Run(name, func(t *testing.T) {
			core := fakecore.Start(t)
			open := ownerOnly(t, core)
			token := core.Key.Token(fakecore.TokenOptions{})
			jar := map[string]string{}
			keep := func(a answer) {
				for _, set := range a.cookies {
					pair, _, _ := strings.Cut(set, ";")
					name, value, _ := strings.Cut(pair, "=")
					if strings.Contains(set, "Max-Age=0") {
						delete(jar, name)
					} else {
						jar[name] = value
					}
				}
			}
			send := func(target string) answer {
				var pairs []string
				for name, value := range jar {
					pairs = append(pairs, name+"="+value)
				}
				a := open.get(target, navigate, map[string]string{"cookie": strings.Join(pairs, "; ")})
				keep(a)
				return a
			}
			// browse follows redirects from target, through core as core
			// would, to a page.
			browse := func(target string) string {
				for {
					a := send(target)
					if a.status != 302 {
						return strconv.Itoa(a.status) + " " + target
					}
					to, _ := url.Parse(a.location())
					target = a.location()
					if strings.HasPrefix(target, core.Origin+"/") {
						target = callbackFor(to.Query().Get("next"), to.Query().Get("state"), &token)
					}
				}
			}
			pages := []string{core.Page, strings.Replace(core.Page, "/notes?x=1", "/other", 1)}
			// Both loads leave before either answer arrives, so neither
			// carries a state, and the browser keeps the state of the
			// answer that lands last.
			away := []answer{open.get(pages[0], navigate), open.get(pages[1], navigate)}
			keep(away[0])
			keep(away[1])

			ends := make([]string, 2)
			for _, tab := range order {
				ends[tab] = browse(callbackFor(pages[tab], stateIn(away[tab].location()), &token))
			}

			if want := []string{"200 " + pages[0], "200 " + pages[1]}; !slices.Equal(ends, want) {
				t.Errorf("ended on %q, want %q", ends, want)
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

var linkPattern = regexp.MustCompile(`<a href="([^"<>]*)">`)

// linksIn is each link in a page's HTML, as a browser reads its href.
func linksIn(html string) []string {
	var links []string
	for _, match := range linkPattern.FindAllStringSubmatch(html, -1) {
		links = append(links, strings.ReplaceAll(match[1], "&amp;", "&"))
	}
	return links
}

// form is a form posted from the app's own page, as a browser sends one.
func form(headers ...map[string]string) map[string]string {
	return with(append([]map[string]string{navigate, {"sec-fetch-site": "same-origin"}}, headers...)...)
}

func TestGuardOnAFormItCantTake(t *testing.T) {
	for _, c := range conformance.FormPostCases(t) {
		t.Run(c.Name, func(t *testing.T) {
			open := guarded(t, nil, session.Options{Access: guard.OwnerRule{}, Core: c.Core})
			headers := form()
			if c.Referer != "" {
				headers["referer"] = c.Referer
			}

			res := open.open(http.MethodPost, onApp(c.Core, "/notes"), headers)

			want := onApp(c.Core, "/_robkit/refresh") + "?" + url.Values{"next": {c.Next}}.Encode()
			if links := linksIn(res.body); res.status != 401 || res.header.Get("content-type") != "text/html; charset=UTF-8" || !slices.Equal(links, []string{want}) {
				t.Errorf("got %d %q %q, want 401 with one link, %q", res.status, res.header.Get("content-type"), links, want)
			}
			if regexp.MustCompile(`<script|<img|onerror`).MatchString(res.body) {
				t.Errorf("the page holds markup from the Referer: %s", res.body)
			}
		})
	}
}

func TestGuardAnswersAFormWithAPageNoCacheKeepsSayingItWasntSent(t *testing.T) {
	core := fakecore.Start(t)

	res := ownerOnly(t, core).open(http.MethodPost, core.Page, form(map[string]string{"referer": core.Page}))

	if res.status != 401 || res.header.Get("cache-control") != "no-store" || !strings.Contains(res.body, "<h1>Your form wasn't sent</h1>") {
		t.Errorf("got %d %v %s", res.status, res.header, res.body)
	}
}

func TestGuardSendsAFormWhoseTokenLapsedBackToItsPageSignedIn(t *testing.T) {
	core := fakecore.Start(t)
	open := ownerOnly(t, core)
	lapsedToken := core.Key.Token(fakecore.TokenOptions{Age: 20 * time.Minute})

	page := open.open(http.MethodPost, core.Page, form(map[string]string{"referer": core.Page}, cookie(lapsedToken)))
	links := linksIn(page.body)
	if len(links) != 1 {
		t.Fatalf("got %d %q, want one link", page.status, page.body)
	}
	away := open.get(links[0], navigate)
	token := core.Key.Token(fakecore.TokenOptions{})
	back := open.get(callbackFor(core.Page, stateIn(away.location()), &token), navigate, cookiesFrom(away))
	signedIn := open.get(core.Page, navigate, cookiesFrom(back))

	if page.status != 401 || back.location() != core.Page {
		t.Errorf("page %d, back to %q", page.status, back.location())
	}
	if signedIn.status != 200 || signedIn.body != viewerJSON(t, guard.Owner{ID: "owner-1"}) {
		t.Errorf("signed in: %d %s", signedIn.status, signedIn.body)
	}
}

func TestGuardSendsASignedOutViewersFormOnAGatedAppToTheHub(t *testing.T) {
	core := fakecore.Start(t)
	open := ownerOnly(t, core)

	page := open.open(http.MethodPost, core.Page, form(map[string]string{"referer": core.Page}))
	links := linksIn(page.body)
	if len(links) != 1 {
		t.Fatalf("got %d %q, want one link", page.status, page.body)
	}
	away := open.get(links[0], navigate)
	back := open.get(callbackFor(core.Page, stateIn(away.location()), nil), navigate, cookiesFrom(away))
	toHub := open.get(core.Page, navigate, cookiesFrom(back))

	if want := []string{"robkit_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax"}; page.status != 401 || !slices.Equal(page.cookies, want) {
		t.Errorf("page %d %q", page.status, page.cookies)
	}
	if back.location() != core.Page || toHub.location() != loginLocation(core, core.Page) {
		t.Errorf("back to %q, then %q", back.location(), toHub.location())
	}
}

func TestGuardLetsASignedOutVisitorsFormOnAnOpenAppThroughAsNobody(t *testing.T) {
	for name, said := range map[string]map[string]string{
		"fresh":               {"cookie": "robkit_session=signed-out." + strconv.FormatInt(time.Now().Unix(), 10)},
		"older than a minute": {"cookie": "robkit_session=signed-out." + strconv.FormatInt(time.Now().Add(-2*time.Minute).Unix(), 10)},
		"absent":              {},
	} {
		t.Run(name, func(t *testing.T) {
			core := fakecore.Start(t)

			res := guarded(t, core, session.Options{Access: guard.OpenRule{}}).open(http.MethodPost, core.Page, form(map[string]string{"referer": core.Page}, said))

			if res.status != 200 || res.body != `{"kind":"nobody"}`+"\n" {
				t.Errorf("got %d %s", res.status, res.body)
			}
		})
	}
}

func TestGuardAnswersAFetchInEachOfThoseCasesAsBefore(t *testing.T) {
	core := fakecore.Start(t)
	call := map[string]string{"sec-fetch-mode": "cors", "sec-fetch-site": "same-origin"}
	old := core.Key.Token(fakecore.TokenOptions{Age: 20 * time.Minute})

	refresh := ownerOnly(t, core).open(http.MethodPost, core.Page, call, cookie(old))
	login := ownerOnly(t, core).open(http.MethodPost, core.Page, call)
	nobody := guarded(t, core, session.Options{Access: guard.OpenRule{}}).open(http.MethodPost, core.Page, call)

	if o, _, l := lapsed(t, refresh); o != "refresh" || l != onApp(core.Origin, "/_robkit/refresh") {
		t.Errorf("refresh: %q %q", o, l)
	}
	if o, _, l := lapsed(t, login); o != "login" || l != core.Hub+"/" {
		t.Errorf("login: %q %q", o, l)
	}
	if nobody.status != 200 || nobody.body != `{"kind":"nobody"}`+"\n" {
		t.Errorf("nobody: %d %s", nobody.status, nobody.body)
	}
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
	rotated := fakecore.NewKey(t)
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
	stranger := fakecore.NewKey(t)

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
		"a token with no expiry":          {fakecore.TokenOptions{Claims: map[string]any{"exp": nil}}, nobody},
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
		core.Key.Sign(map[string]any{"alg": "EdDSA", "kid": core.Key.Kid}, "a string"),
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

func TestGuardReadsTheSettingsItIsNotGiven(t *testing.T) {
	core := fakecore.Start(t)
	t.Setenv("ROBKIT_APP", fakecore.App)
	t.Setenv("ROBKIT_CORE_URL", core.Origin)

	wrap, err := session.Guarded(session.Options{Access: guard.OwnerRule{}})
	if err != nil {
		t.Fatal(err)
	}
	a := app{t, wrap(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(session.ViewerFrom(r.Context()))
	}))}
	signedIn := a.get(core.Page, navigate, cookie(core.Key.Token(fakecore.TokenOptions{})))
	away := a.get(core.Page, navigate)

	if signedIn.status != 200 || !strings.Contains(signedIn.body, `"kind":"owner"`) || away.status != 302 {
		t.Errorf("signed in: %d %s, away: %d", signedIn.status, signedIn.body, away.status)
	}
}

func TestGuardReadsOnlyTheSettingsItIsNotGiven(t *testing.T) {
	core := fakecore.Start(t)
	t.Setenv("ROBKIT_APP", "Not-This")
	t.Setenv("ROBKIT_CORE_URL", core.Origin)
	if _, err := session.Guarded(session.Options{App: "notes"}); err != nil {
		t.Errorf("with App given: %v", err)
	}

	t.Setenv("ROBKIT_APP", "notes")
	t.Setenv("ROBKIT_CORE_URL", "http://core.example.com")
	if _, err := session.Guarded(session.Options{Core: core.Origin}); err != nil {
		t.Errorf("with Core given: %v", err)
	}
}

func TestGuardSaysWhatToFixInTheSettingsItReads(t *testing.T) {
	t.Setenv("ROBKIT_APP", "")
	t.Setenv("ROBKIT_CORE_URL", "http://core.example.com/")

	_, err := session.Guarded(session.Options{})

	want := "ROBKIT_APP is not set. Run the app with pnpm dev, which sets it to the app's slug.\n" +
		`ROBKIT_CORE_URL is "http://core.example.com/", which is http on a domain that isn't local. Serve the install over https and set it to https://core.example.com.`
	if err == nil || err.Error() != want {
		t.Errorf("got %v", err)
	}
}

func TestGuardJudgesCoresAddressAlikeFromSettingsAndCode(t *testing.T) {
	for _, c := range conformance.CoreAddressCases(t) {
		t.Run(c.Origin, func(t *testing.T) {
			options, envErr := session.ReadGuardEnv(func(name string) string {
				return map[string]string{"ROBKIT_APP": "notes", "ROBKIT_CORE_URL": c.Origin}[name]
			})
			_, codeErr := session.Guarded(session.Options{App: "notes", Core: c.Origin})

			fromEnv := envErr == nil && options.Core == c.Origin
			if fromEnv != c.Accepted || (codeErr == nil) != c.Accepted {
				t.Errorf("ReadGuardEnv: %v, Guarded: %v, want accepted %v", envErr, codeErr, c.Accepted)
			}
		})
	}
}

func TestGuardSaysWhyItRefusesPlainHTTPOffALocalDomain(t *testing.T) {
	_, envErr := session.ReadGuardEnv(func(name string) string {
		return map[string]string{"ROBKIT_APP": "notes", "ROBKIT_CORE_URL": "http://core.example.com/"}[name]
	})
	_, codeErr := session.Guarded(session.Options{App: "notes", Core: "http://core.example.com"})

	fromEnv := `ROBKIT_CORE_URL is "http://core.example.com/", which is http on a domain that isn't local. Serve the install over https and set it to https://core.example.com.`
	fromCode := `session: Core is "http://core.example.com", which is http on a domain that isn't local. Serve the install over https and set it to https://core.example.com.`
	if envErr == nil || envErr.Error() != fromEnv {
		t.Errorf("ReadGuardEnv: %v", envErr)
	}
	if codeErr == nil || codeErr.Error() != fromCode {
		t.Errorf("Guarded: %v", codeErr)
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

// answerHeaders is each of conformance.AnswerHeaders an answer carries,
// every value it sends joined with a comma, so a header sent twice can't
// match a row.
func answerHeaders(header http.Header) map[string]string {
	got := map[string]string{}
	for _, name := range conformance.AnswerHeaders {
		if values := header.Values(name); len(values) > 0 {
			got[name] = strings.Join(values, ", ")
		}
	}
	return got
}

func TestGuardOnWhatAnAnswerTellsTheBrowser(t *testing.T) {
	for _, c := range conformance.HeaderCases(t) {
		t.Run(c.Name, func(t *testing.T) {
			var rule guard.AccessRule = guard.OpenRule{}
			if c.Access == "owner" {
				rule = guard.OwnerRule{}
			}
			wrap, err := session.Guarded(session.Options{App: fakecore.App, Access: rule, Core: c.Core})
			if err != nil {
				t.Fatal(err)
			}
			reached := false
			handler := wrap(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				reached = true
				if r.URL.Path == "/moved" {
					http.Redirect(w, r, "/", http.StatusFound)
					return
				}
				w.Header().Set("content-security-policy", "default-src 'self'")
				_, _ = io.WriteString(w, "the app")
			}))
			page := strings.Replace(c.Core, "//core.", "//"+fakecore.App+".", 1) + c.Target
			r := httptest.NewRequest(c.Method, page, nil)
			for name, value := range c.Headers {
				r.Header.Set(name, value)
			}
			if c.SignedOut {
				r.Header.Set("cookie", fakecore.SignedOutCookie(c.Core))
			}
			w := httptest.NewRecorder()

			handler.ServeHTTP(w, r)

			if got := answerHeaders(w.Result().Header); w.Code != c.Status || reached != c.Reached || !reflect.DeepEqual(got, c.Answer) {
				t.Errorf("got %d, reached %v, %v; want %d, reached %v, %v", w.Code, reached, got, c.Status, c.Reached, c.Answer)
			}
		})
	}
}

func TestGuardAnswers404WithBothHeaders(t *testing.T) {
	core := fakecore.Start(t)

	res := ownerOnly(t, core).get(core.Page, navigate, cookie(core.Key.Token(fakecore.TokenOptions{Holder: fakecore.Guest()})))

	want := map[string]string{"x-frame-options": "SAMEORIGIN", "x-content-type-options": "nosniff"}
	if got := answerHeaders(res.header); res.status != 404 || !reflect.DeepEqual(got, want) {
		t.Errorf("got %d %v", res.status, got)
	}
}

func TestGuardAnswers503WithBothHeadersWhenItCantCheckTheSession(t *testing.T) {
	core := fakecore.Start(t)
	core.SetStatus(503)

	res := guarded(t, core, session.Options{Access: guard.OwnerRule{}, OnUnavailable: func(session.Fault) {}}).
		get(core.Page, cookie(core.Key.Token(fakecore.TokenOptions{})))

	want := map[string]string{"x-frame-options": "SAMEORIGIN", "x-content-type-options": "nosniff"}
	if got := answerHeaders(res.header); res.status != 503 || !reflect.DeepEqual(got, want) {
		t.Errorf("got %d %v", res.status, got)
	}
}

func TestGuardSendsNosniffAndNoFramingHeaderOnItsCallbacksRedirect(t *testing.T) {
	core := fakecore.Start(t)
	open := ownerOnly(t, core)
	away := open.get(core.Page, navigate)
	token := core.Key.Token(fakecore.TokenOptions{})

	back := open.get(callbackFor(core.Page, stateIn(away.location()), &token), navigate, cookiesFrom(away))

	want := map[string]string{"x-content-type-options": "nosniff"}
	if got := answerHeaders(back.header); back.status != 302 || !reflect.DeepEqual(got, want) {
		t.Errorf("got %d %v", back.status, got)
	}
}
