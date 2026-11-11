# 15: A guide for React + Go

**What to build:** The React + Go guide, under the headings ticket 11 set, with the same parts: the template's own files shown with the component, the same "make it yours" steps done in a real app first, links out, and a test on the file list.

Cover what differs: Go on the `PATH` and which version, robkit's Go module in `vendor/robkit/go`, the Go migrator, `session.WithViewer` in a test, and the page's calls to the Go server through `sessionFetch`. The Go version the docs promise is being settled in milestone 4 (ticket 25 of "Just use it"). Read it from the template's `go.mod` when the site builds.

**Blocked by:** 11

**Status:** ready-for-agent

- [ ] The guide has ticket 11's headings, and shows the template's files with the component
- [ ] A test fails when the React + Go template gains or loses a file the guide names
- [ ] The "make it yours" steps were done in an app made from this checkout, with `go vet` and `go test` passing, and the Proof says so
- [ ] Every `go` fence passes the `gofmt` test, and the Go version on the page is read from the template
- [ ] The guide is no longer a stub
- [ ] The PR's CI `gate` job passes on GitHub
