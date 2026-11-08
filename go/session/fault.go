package session

import (
	"fmt"
	"io"
	"os"
)

// Failed is what failed when the guard couldn't check a request.
type Failed string

const (
	// FailedCoreKey means the guard couldn't check the session against
	// core's key: core answered, but not with its key set.
	FailedCoreKey Failed = "core-key"
	// FailedAccessRule means the guard couldn't load the app's access rule:
	// core answered, but not with the rule.
	FailedAccessRule Failed = "access-rule"
	// FailedNetwork means the guard couldn't reach core at all.
	FailedNetwork Failed = "network"
)

// AccessRuleFailure is how core's answer failed to give the app's access
// rule.
type AccessRuleFailure string

const (
	// UnknownApp means core doesn't know the app.
	UnknownApp AccessRuleFailure = "unknown-app"
	// BadAnswer means core answered with an error, or with JSON that isn't
	// an access rule.
	BadAnswer AccessRuleFailure = "bad-answer"
	// InvalidJSON means core's answer isn't JSON.
	InvalidJSON AccessRuleFailure = "invalid-json"
	// InterruptedBody means core's answer broke off before its end.
	InterruptedBody AccessRuleFailure = "interrupted-body"
)

// Fault is why the guard couldn't check a request, so answered 503 rather
// than treating the viewer as signed out.
type Fault struct {
	// App is the app's slug.
	App string
	// Failed says what failed.
	Failed Failed
	// Reason says how core's answer failed, when Failed is
	// FailedAccessRule.
	Reason AccessRuleFailure
	// Cause is the error behind it.
	Cause error
}

var whatFailed = map[Failed]string{
	FailedCoreKey:    "couldn't check the session against core's key",
	FailedAccessRule: "couldn't load the app's access rule from core",
	FailedNetwork:    "couldn't reach core",
}

// reportOutput is where the default OnUnavailable reports.
var reportOutput io.Writer = os.Stderr

// reportFault is the default OnUnavailable: it reports the app, what failed
// and the cause.
func reportFault(fault Fault) {
	fmt.Fprintf(reportOutput, "robkit guard for %s answered 503: %s.\n%v\n", fault.App, whatFailed[fault.Failed], fault.Cause)
}

// unreachableError is core not answering: the network failed, or the
// request timed out.
type unreachableError struct {
	origin string
	cause  error
}

func (e *unreachableError) Error() string { return "Can't reach core at " + e.origin + "." }
func (e *unreachableError) Unwrap() error { return e.cause }

// accessRuleError is core answering, but not with the app's access rule.
type accessRuleError struct {
	failure AccessRuleFailure
	message string
	cause   error
}

func (e *accessRuleError) Error() string { return e.message }
func (e *accessRuleError) Unwrap() error { return e.cause }
