package session

import (
	"io"
	"testing"
)

// SetReportOutput sends the default OnUnavailable's report to w until the
// test ends.
func SetReportOutput(t testing.TB, w io.Writer) {
	previous := reportOutput
	reportOutput = w
	t.Cleanup(func() { reportOutput = previous })
}
