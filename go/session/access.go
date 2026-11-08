package session

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"sync"
	"time"

	"github.com/RobertScholey98/robkit/go/guard"
)

// accessRuleMaxAge is how long an app keeps its rule before asking core
// again.
const accessRuleMaxAge = time.Minute

// coreAccess is the app's access rule as the owner set it in admin, fetched
// from core and kept for a minute, so a change reaches the app within one.
// A failed load is an error, and the next request tries again: an
// *accessRuleError when core answered, and an *unreachableError when it
// didn't. Requests that arrive together share one load.
type coreAccess struct {
	url    string
	slug   string
	client *http.Client
	now    func() time.Time

	mu      sync.Mutex
	cached  guard.AccessRule
	until   time.Time
	pending *ruleLoad
}

type ruleLoad struct {
	done chan struct{}
	rule guard.AccessRule
	err  error
}

func newCoreAccess(core, slug string, client *http.Client, now func() time.Time) *coreAccess {
	return &coreAccess{
		url:    core + "/apps/" + url.PathEscape(slug) + "/access",
		slug:   slug,
		client: client,
		now:    now,
	}
}

func (a *coreAccess) rule() (guard.AccessRule, error) {
	a.mu.Lock()
	if a.cached != nil && a.now().Before(a.until) {
		rule := a.cached
		a.mu.Unlock()
		return rule, nil
	}
	current := a.pending
	if current == nil {
		current = &ruleLoad{done: make(chan struct{})}
		a.pending = current
		go a.load(current)
	}
	a.mu.Unlock()
	<-current.done
	return current.rule, current.err
}

func (a *coreAccess) load(current *ruleLoad) {
	rule, err := a.fetch()
	a.mu.Lock()
	if err == nil {
		a.cached, a.until = rule, a.now().Add(accessRuleMaxAge)
	}
	a.pending = nil
	current.rule, current.err = rule, err
	a.mu.Unlock()
	close(current.done)
}

func (a *coreAccess) fetch() (guard.AccessRule, error) {
	status, body, readErr, err := fetchCore(a.client, a.url)
	if err != nil {
		return nil, err
	}
	fail := func(failure AccessRuleFailure, cause error, message string) error {
		return &accessRuleError{failure: failure, message: message, cause: cause}
	}
	if status == http.StatusNotFound {
		return nil, fail(UnknownApp, nil, "Core doesn't know an app called "+a.slug+".")
	}
	if status < 200 || status > 299 {
		return nil, fail(BadAnswer, nil, fmt.Sprintf("Core answered %d for %s's access rule.", status, a.slug))
	}
	answerFor := "Core's answer for " + a.slug + "'s access rule"
	if readErr != nil {
		return nil, fail(InterruptedBody, readErr, answerFor+" broke off before its end.")
	}
	var parsed any
	if err := json.Unmarshal(body, &parsed); err != nil {
		return nil, fail(InvalidJSON, err, answerFor+" isn't JSON.")
	}
	rule, err := guard.ReadAccessRule(body)
	if err != nil {
		return nil, fail(BadAnswer, err, "Core sent an access rule for "+a.slug+" that isn't one.")
	}
	return rule, nil
}
