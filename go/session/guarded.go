// Package session is robkit's guard for a Go app, ported from
// @robkit/session's request guard. Guarded is http.Handler middleware: it
// checks the app's own session cookie against core's public key and the
// app's slug, then lets the request through to the viewer, sends the
// browser to core for a token or to the hub to log in, or answers 404.
// Handlers read the viewer with ViewerFrom.
//
// It answers two paths itself: /_robkit/session, where core hands the app
// its token, and /_robkit/refresh, where a call from the page whose token
// lapsed sends the browser for a new one. A call, as opposed to a page
// load, whose session lapsed gets a 401 that @robkit/react's sessionFetch
// reads.
package session

import (
	"context"
	"errors"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/RobertScholey98/robkit/go/guard"
)

type viewerKey struct{}

// WithViewer is ctx carrying viewer, as Guarded hands it to the app's
// handlers. A test of a handler builds its request's context with it.
func WithViewer(ctx context.Context, viewer guard.Viewer) context.Context {
	return context.WithValue(ctx, viewerKey{}, viewer)
}

// ViewerFrom is who is asking: guard.Owner, guard.Guest, or guard.Nobody in
// an app open to anyone. Switch on its type. It panics if the request
// didn't come through Guarded, since then nobody checked who is asking.
func ViewerFrom(ctx context.Context) guard.Viewer {
	viewer, ok := ctx.Value(viewerKey{}).(guard.Viewer)
	if !ok {
		panic("session.ViewerFrom: this request didn't come through session.Guarded, so nobody checked who is asking. Wrap the app's handler in the guard.")
	}
	return viewer
}

const (
	errLogin   = "Sign in to use this app."
	errRefresh = "Your session needs refreshing."
	errKeys    = "Can't reach core to check your session."
	errRule    = "Can't reach core to check who may open this app."
)

// requestGuard decides what the app does with each request.
type requestGuard struct {
	app string
	// origin is the app's public origin, from its options: core's scheme
	// and port, on <app>.<domain>. Every URL the guard builds starts with
	// it.
	origin        *url.URL
	hub           string
	rule          func() (guard.AccessRule, error)
	onUnavailable func(Fault)
	protocol      *refreshProtocol
}

// Guarded is robkit's guard as middleware for every request the app
// serves. It checks options and refuses ones that won't do.
func Guarded(options Options) (func(http.Handler) http.Handler, error) {
	g, err := newRequestGuard(options)
	if err != nil {
		return nil, err
	}
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			viewer, answer := g.check(r)
			if answer != nil {
				answer.write(w)
				return
			}
			next.ServeHTTP(w, r.WithContext(WithViewer(r.Context(), viewer)))
		})
	}, nil
}

func newRequestGuard(options Options) (*requestGuard, error) {
	if err := checkSlug(options.App); err != nil {
		return nil, errors.New("session: App: " + err.Error())
	}
	if !isCoreOrigin(options.Core) {
		return nil, errors.New("session: Core is " + shown(options.Core) + ", which isn't core's address. Set it to core's public origin, such as https://core.robkit.dev.")
	}
	now := options.Now
	if now == nil {
		now = time.Now
	}
	onUnavailable := options.OnUnavailable
	if onUnavailable == nil {
		onUnavailable = reportFault
	}
	core, _ := url.Parse(options.Core)
	domain := strings.TrimPrefix(core.Hostname(), "core.")
	hub, origin := *core, *core
	hub.Host = strings.Replace(core.Host, "core.", "hub.", 1)
	origin.Host = strings.Replace(core.Host, "core.", options.App+".", 1)
	client := coreClient()
	g := &requestGuard{
		app:           options.App,
		origin:        &origin,
		hub:           hub.String(),
		onUnavailable: onUnavailable,
	}
	if options.Access != nil {
		access := options.Access
		g.rule = func() (guard.AccessRule, error) { return access, nil }
	} else {
		g.rule = newCoreAccess(options.Core, options.App, client, now).rule
	}
	g.protocol = &refreshProtocol{
		app:    options.App,
		core:   options.Core,
		secure: domain != "localhost" && !strings.HasSuffix(domain, ".localhost"),
		keys: &keySet{
			url:    options.Core + "/.well-known/jwks.json",
			client: client,
			now:    now,
		},
		now:            now,
		keyUnavailable: g.keyUnavailable,
	}
	return g, nil
}

// unavailable is a 503 for a check that failed, after telling
// onUnavailable why.
func (g *requestGuard) unavailable(fault Fault, body string) response {
	g.onUnavailable(fault)
	return text(body, http.StatusServiceUnavailable)
}

func (g *requestGuard) keyUnavailable(cause error) response {
	failed := FailedCoreKey
	var unreachable *unreachableError
	if errors.As(cause, &unreachable) {
		failed = FailedNetwork
	}
	return g.unavailable(Fault{App: g.app, Failed: failed, Cause: cause}, errKeys)
}

func (g *requestGuard) ruleUnavailable(cause error) response {
	fault := Fault{App: g.app, Failed: FailedNetwork, Cause: cause}
	var answered *accessRuleError
	if errors.As(cause, &answered) {
		fault.Failed, fault.Reason = FailedAccessRule, answered.failure
	}
	return g.unavailable(fault, errRule)
}

// check is the viewer the guard lets r through to, or its own answer.
func (g *requestGuard) check(r *http.Request) (guard.Viewer, *response) {
	u := publicURL(r, g.origin)
	if own, ok := g.protocol.answer(r, u); ok {
		return nil, &own
	}
	session, err := g.protocol.sessionOf(r)
	if err != nil {
		// Not knowing who is asking isn't the same as nobody asking, so
		// the browser isn't sent to log in.
		answer := g.keyUnavailable(err)
		return nil, &answer
	}
	rule, err := g.rule()
	if err != nil {
		answer := g.ruleUnavailable(err)
		return nil, &answer
	}
	var answer response
	switch decision := guard.Decide(rule, session).(type) {
	case guard.Allow:
		return decision.Viewer, nil
	case guard.NotFound:
		answer = text("Not found", http.StatusNotFound)
	case guard.Login:
		// Core's word that nobody is signed in goes, so once the browser
		// signs in at the hub and comes back, the app asks core again.
		if !isNavigation(r) {
			// A call doesn't know the page it came from. The page adds
			// next.
			answer = sessionLapsed("login", errLogin, g.hub+"/")
			answer.header.Add("set-cookie", g.protocol.forget())
		} else {
			answer = redirect(withQuery(g.hub+"/", "next", u.String()), "set-cookie", g.protocol.forget())
		}
	default:
		if !isNavigation(r) {
			answer = sessionLapsed("refresh", errRefresh, origin(u)+appRefreshPath)
		} else {
			answer = g.protocol.toCore(r, u.String())
		}
	}
	return nil, &answer
}
