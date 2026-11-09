package session

import (
	"bytes"
	"encoding/json"
	"errors"
	"net/url"
	"regexp"
	"strings"
	"time"

	"github.com/RobertScholey98/robkit/go/guard"
)

// Options configure Guarded.
type Options struct {
	// App is the app's slug, which is also its subdomain. The guard accepts
	// only a token core minted for this slug.
	App string
	// Core is core's public origin, such as https://core.robkit.dev. The hub
	// is beside it on hub. It comes from config, never the request's Host,
	// so a request can't choose whose keys the app trusts.
	Core string
	// Access is a fixed rule, for an app core's catalog doesn't hold.
	// Without one, the rule comes from core's catalog and is kept for a
	// minute, so a change in admin reaches the app within one.
	Access guard.AccessRule
	// OnUnavailable hears why the guard answered 503 because it couldn't
	// check a request. By default it reports the app's slug, what failed
	// and the cause on standard error.
	OnUnavailable func(Fault)
	// Now is the clock that dates tokens, core's word that nobody is
	// signed in, and the cached rule and keys. time.Now by default.
	Now func() time.Time
}

// ReadGuardEnv reads what the guard needs from the app's environment, as
// pnpm dev and robkit deploy set it: ROBKIT_APP, the app's slug, and
// ROBKIT_CORE_URL, core's public origin. Pass os.Getenv. Its error says how
// to fix each variable that won't do, one per line.
func ReadGuardEnv(getenv func(string) string) (Options, error) {
	var problems []string
	app := getenv("ROBKIT_APP")
	if app == "" {
		problems = append(problems, "ROBKIT_APP is not set. Run the app with pnpm dev, which sets it to the app's slug.")
	} else if err := checkSlug(app); err != nil {
		problems = append(problems, "ROBKIT_APP: "+err.Error())
	}
	core := getenv("ROBKIT_CORE_URL")
	if core == "" {
		problems = append(problems, "ROBKIT_CORE_URL is not set. Run the app with pnpm dev, which sets it, or set it to core's public origin, such as https://core.robkit.dev.")
	} else if origin, ok := originOf(core); ok && isCoreOrigin(origin) {
		core = origin
	} else {
		problems = append(problems, notCoreOrigin("ROBKIT_CORE_URL is", core))
	}
	if len(problems) > 0 {
		return Options{}, errors.New(strings.Join(problems, "\n"))
	}
	return Options{App: app, Core: core}, nil
}

// shown is value as JSON shows it, as robkit's problems quote a value.
func shown(value string) string {
	var out bytes.Buffer
	encoder := json.NewEncoder(&out)
	encoder.SetEscapeHTML(false)
	_ = encoder.Encode(value)
	return strings.TrimSuffix(out.String(), "\n")
}

var (
	slugPattern = regexp.MustCompile(`^[a-z][a-z0-9]{0,62}$`)
	label       = `[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?`
	domainLike  = regexp.MustCompile(`(?i)^` + label + `(?:\.` + label + `)*$`)
	allDigits   = regexp.MustCompile(`^\d+$`)
)

// checkSlug refuses what can't be an app's slug, as @robkit/input's
// readSlug does.
func checkSlug(value string) error {
	if slugPattern.MatchString(value) && value != "public" && value != "postgres" {
		return nil
	}
	return errors.New(shown(value) + " can't be an app's slug, which is also its subdomain and database role. Use lowercase letters and digits, start with a letter, and avoid public and postgres.")
}

// isDomain says whether value is a host name alone, whose last label isn't
// all digits.
func isDomain(value string) bool {
	last := value[strings.LastIndex(value, ".")+1:]
	return len(value) <= 253 && domainLike.MatchString(value) && !allDigits.MatchString(last)
}

// originOf is an absolute http(s) URL's origin, as a browser writes it:
// the scheme and host in lowercase, and no port where it is the scheme's
// own.
func originOf(value string) (string, bool) {
	u, err := url.Parse(value)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" || u.User != nil {
		return "", false
	}
	return origin(u), true
}

func origin(u *url.URL) string {
	scheme := strings.ToLower(u.Scheme)
	host := strings.ToLower(u.Host)
	if (scheme == "http" && strings.HasSuffix(host, ":80")) || (scheme == "https" && strings.HasSuffix(host, ":443")) {
		host = host[:strings.LastIndex(host, ":")]
	}
	return scheme + "://" + host
}

// coreDomain is the domain of value, an http(s) origin on core.<domain>,
// whatever its protocol.
func coreDomain(value string) (string, bool) {
	origin, ok := originOf(value)
	if !ok || origin != value {
		return "", false
	}
	u, _ := url.Parse(value)
	domain, found := strings.CutPrefix(u.Hostname(), "core.")
	return domain, found && isDomain(domain)
}

// isLocal says whether domain is localhost or a name under it, as
// @robkit/input's isLocal does.
func isLocal(domain string) bool {
	return domain == "localhost" || strings.HasSuffix(domain, ".localhost")
}

// isCoreOrigin says whether value is core's address: an origin on
// core.<domain>, over https, or over http only on a local domain, as
// readCoreUrl in @robkit/input allows. Both ReadGuardEnv and Guarded ask
// it, so an address written in code is judged as one read from settings.
func isCoreOrigin(value string) bool {
	domain, ok := coreDomain(value)
	return ok && (strings.HasPrefix(value, "https://") || isLocal(domain))
}

// notCoreOrigin is why value, as subject names it, isn't core's address.
func notCoreOrigin(subject, value string) string {
	if origin, ok := originOf(value); ok {
		if domain, onCore := coreDomain(origin); onCore && !isLocal(domain) && strings.HasPrefix(origin, "http://") {
			return subject + " " + shown(value) + ", which is http on a domain that isn't local. Serve the install over https and set it to https://" + strings.TrimPrefix(origin, "http://") + "."
		}
	}
	return subject + " " + shown(value) + ", which isn't core's address. Set it to core's public origin, such as https://core.robkit.dev."
}
