package session

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
)

// response is the guard's own answer to a request it didn't let through.
type response struct {
	status int
	header http.Header
	body   []byte
}

func (r response) write(w http.ResponseWriter) {
	for name, values := range r.header {
		w.Header()[name] = values
	}
	w.WriteHeader(r.status)
	_, _ = w.Write(r.body)
}

// text is a plain-text answer that no cache keeps.
func text(body string, status int) response {
	header := http.Header{}
	header.Set("content-type", "text/plain; charset=UTF-8")
	header.Set("cache-control", "no-store")
	return response{status: status, header: header, body: []byte(body)}
}

// redirect is a redirect that no cache keeps, with any extra headers, each
// a name and a value.
func redirect(location string, extra ...string) response {
	header := http.Header{}
	header.Set("cache-control", "no-store")
	header.Set("location", location)
	for i := 0; i+1 < len(extra); i += 2 {
		header.Add(extra[i], extra[i+1])
	}
	return response{status: http.StatusFound, header: header}
}

// sessionLapsedHeader marks the guard's 401, naming where the browser goes.
// @robkit/react's sessionFetch reads it.
const sessionLapsedHeader = "robkit-session"

// sessionLapsed is the guard's 401 for a call, as opposed to a page load,
// it turned away: log in at the hub ("login"), or get the app a new token
// through core ("refresh"). The page adds next, since it knows itself.
func sessionLapsed(outcome, message, location string) response {
	var body bytes.Buffer
	encoder := json.NewEncoder(&body)
	encoder.SetEscapeHTML(false)
	_ = encoder.Encode(struct {
		Error    string `json:"error"`
		Location string `json:"location"`
	}{message, location})
	header := http.Header{}
	header.Set("content-type", "application/json")
	header.Set("cache-control", "no-store")
	header.Set(sessionLapsedHeader, outcome)
	return response{status: http.StatusUnauthorized, header: header, body: bytes.TrimSuffix(body.Bytes(), []byte("\n"))}
}

// publicURL is the page the browser asked for: the app's own origin, from
// its options, plus r's path and query. Nothing in r decides the origin, so
// a proxy hop that rewrites Host or X-Forwarded-Proto changes nothing.
func publicURL(r *http.Request, origin *url.URL) *url.URL {
	u := &url.URL{Scheme: origin.Scheme, Host: origin.Host, Path: r.URL.Path, RawPath: r.URL.RawPath, RawQuery: r.URL.RawQuery}
	return normalized(u)
}

// normalized is u as a browser writes it: the scheme and host in
// lowercase, no port where it is the scheme's own, a path with no dot
// segments, at least "/".
func normalized(u *url.URL) *url.URL {
	host := strings.TrimPrefix(origin(u), strings.ToLower(u.Scheme)+"://")
	clean := u.ResolveReference(&url.URL{})
	clean.Scheme, clean.Host = strings.ToLower(u.Scheme), host
	clean.Fragment, clean.RawFragment = u.Fragment, u.RawFragment
	if clean.Path == "" {
		clean.Path, clean.RawPath = "/", ""
	}
	return clean
}

// nextOn is the next u names, if it is a page on the same app. A page
// under the guard's own paths isn't one.
func nextOn(u *url.URL) (string, bool) {
	next := u.Query().Get("next")
	target, err := url.Parse(next)
	if err != nil || (target.Scheme != "http" && target.Scheme != "https") || target.Host == "" || target.User != nil {
		return "", false
	}
	target = normalized(target)
	if origin(target) != origin(u) || strings.HasPrefix(target.EscapedPath(), "/_robkit/") {
		return "", false
	}
	return target.String(), true
}

// isWebSocketHandshake says whether r is a GET whose Upgrade is websocket,
// in any case.
func isWebSocketHandshake(r *http.Request) bool {
	return r.Method == http.MethodGet && strings.EqualFold(strings.Join(r.Header.Values("upgrade"), ", "), "websocket")
}

// isFromAnotherOrigin says whether the guard refuses r as coming from
// another origin than the app's own, appOrigin. A browser sends an app's
// cookie with a form posted from a sibling subdomain, so the cookie alone
// doesn't say the viewer meant it.
//
// GET, HEAD and OPTIONS pass. Every other method is a write. A browser
// can't forge Sec-Fetch-Site, so when a write carries it, only same-origin
// and none pass, whatever Origin says. Without it, Origin decides: absent
// or the app's own passes. A WebSocket handshake is judged by Origin alone,
// because browsers disagree on the fetch metadata they send with one.
func isFromAnotherOrigin(r *http.Request, appOrigin string) bool {
	from := r.Header.Values("origin")
	elsewhere := len(from) > 0 && strings.Join(from, ", ") != appOrigin
	if isWebSocketHandshake(r) {
		return elsewhere
	}
	switch r.Method {
	case http.MethodGet, http.MethodHead, http.MethodOptions:
		return false
	}
	if site := r.Header.Values("sec-fetch-site"); len(site) > 0 {
		joined := strings.Join(site, ", ")
		return joined != "same-origin" && joined != "none"
	}
	return elsewhere
}

// isNavigation says whether r is a page load, which can follow a redirect
// to the hub or core. A fetch from the page, or a server calling the app,
// can't, so it gets 401 and the place to send the browser. Without fetch
// metadata, only a request that accepts HTML counts as a page load.
func isNavigation(r *http.Request) bool {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		return false
	}
	if modes := r.Header.Values("sec-fetch-mode"); len(modes) > 0 {
		return strings.Join(modes, ", ") == "navigate"
	}
	return strings.Contains(strings.Join(r.Header.Values("accept"), ", "), "text/html")
}

// isBrowserNavigation says whether r is a page load by a browser that says
// so, which keeps cookies and so can go through core and come back. A
// client without fetch metadata, such as a server or a link preview, might
// not, and would bounce for ever.
func isBrowserNavigation(r *http.Request) bool {
	return (r.Method == http.MethodGet || r.Method == http.MethodHead) &&
		strings.Join(r.Header.Values("sec-fetch-mode"), ", ") == "navigate"
}

// hostOnlyCookie is a Set-Cookie value for a host-only cookie on the app's
// own subdomain.
func hostOnlyCookie(name, value string, maxAge int, secure bool) string {
	cookie := fmt.Sprintf("%s=%s; Path=/; Max-Age=%d; HttpOnly; SameSite=Lax", name, value, maxAge)
	if secure {
		cookie += "; Secure"
	}
	return cookie
}

// cookieValues is every value of the cookie name the request's Cookie
// headers carry, in order. A name matches only when it is name exactly
// once spaces and tabs around it are trimmed. strings.TrimSpace would also
// strip a no-break space, and a sibling app can set a cookie whose name
// starts with one, since a browser doesn't read that name as __Host-.
func cookieValues(r *http.Request, name string) []string {
	var values []string
	for _, pair := range strings.Split(strings.Join(r.Header.Values("cookie"), "; "), ";") {
		key, value, _ := strings.Cut(pair, "=")
		if strings.Trim(key, " \t") == name {
			values = append(values, strings.Trim(value, " \t"))
		}
	}
	return values
}

// formEncode writes a query's name or value as a browser's URLSearchParams
// does: letters, digits and *-._ as they are, a space as +, and every other
// byte of its UTF-8 as %XX.
func formEncode(value string) string {
	var out strings.Builder
	for _, b := range []byte(value) {
		switch {
		case b >= 'a' && b <= 'z', b >= 'A' && b <= 'Z', b >= '0' && b <= '9', b == '*', b == '-', b == '.', b == '_':
			out.WriteByte(b)
		case b == ' ':
			out.WriteByte('+')
		default:
			fmt.Fprintf(&out, "%%%02X", b)
		}
	}
	return out.String()
}

// withQuery is base with the query names and values, in order.
func withQuery(base string, pairs ...string) string {
	var query []string
	for i := 0; i+1 < len(pairs); i += 2 {
		query = append(query, formEncode(pairs[i])+"="+formEncode(pairs[i+1]))
	}
	return base + "?" + strings.Join(query, "&")
}
