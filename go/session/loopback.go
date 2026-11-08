package session

import (
	"context"
	"io"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// coreTimeout is how long a request to core may take, its body included.
const coreTimeout = 5 * time.Second

func isLoopbackName(host string) bool {
	return host == "localhost" || strings.HasSuffix(host, ".localhost")
}

// coreClient fetches from core. It reaches localhost and *.localhost names
// on 127.0.0.1 with the original Host, and over https with the name for
// TLS, as browsers do (RFC 6761): a resolver may not know these names, and
// the dev proxy reads the Host to tell which app was asked for. It follows
// no redirect and uses no proxy, as Node's fetch does.
func coreClient() *http.Client {
	dialer := &net.Dialer{Timeout: coreTimeout}
	return &http.Client{
		Transport: &http.Transport{
			DialContext: func(ctx context.Context, network, address string) (net.Conn, error) {
				host, port, err := net.SplitHostPort(address)
				if err == nil && isLoopbackName(strings.ToLower(host)) {
					address = net.JoinHostPort("127.0.0.1", port)
				}
				return dialer.DialContext(ctx, network, address)
			},
			TLSHandshakeTimeout: coreTimeout,
			ForceAttemptHTTP2:   true,
			MaxIdleConns:        4,
			IdleConnTimeout:     90 * time.Second,
		},
		CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse },
	}
}

// fetchCore GETs target from core, asking for JSON, and reads the whole
// answer within coreTimeout. No answer at all is an *unreachableError;
// a body that breaks off is readErr, with the status it came with.
func fetchCore(client *http.Client, target string) (status int, body []byte, readErr error, err error) {
	ctx, cancel := context.WithTimeout(context.Background(), coreTimeout)
	defer cancel()
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, target, nil)
	if err != nil {
		return 0, nil, nil, err
	}
	request.Header.Set("accept", "application/json")
	response, err := client.Do(request)
	if err != nil {
		u, _ := url.Parse(target)
		return 0, nil, nil, &unreachableError{origin: origin(u), cause: err}
	}
	defer response.Body.Close()
	body, readErr = io.ReadAll(response.Body)
	return response.StatusCode, body, readErr, nil
}
