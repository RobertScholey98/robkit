package main

import (
	"context"
	"fmt"
	"net"
	"net/http/httputil"
	"net/url"
	"os"
	"os/exec"
	"strconv"
	"time"
)

// dev serves the app as pnpm dev runs it. The server listens on PORT, as
// in production, and passes every request the guard lets through, beyond
// the API, to a Vite dev server on a port of its own: the page, its
// modules and Vite's hot updates, whose WebSocket the proxy carries. It
// stops when Vite exits.
func dev(ctx context.Context) error {
	port, err := freePort()
	if err != nil {
		return err
	}
	vite := exec.CommandContext(ctx, "node", "node_modules/vite/bin/vite.js")
	// The later PORT wins, so Vite takes its own port and the server PORT.
	vite.Env = append(os.Environ(), "PORT="+strconv.Itoa(port))
	vite.Stdout, vite.Stderr = os.Stdout, os.Stderr
	if err := vite.Start(); err != nil {
		return fmt.Errorf("can't start Vite: %w. Run pnpm install, then try again", err)
	}
	exited := make(chan error, 1)
	go func() {
		err := vite.Wait()
		exited <- fmt.Errorf("vite exited (%v), stopping", err)
	}()

	address := net.JoinHostPort("127.0.0.1", strconv.Itoa(port))
	if err := waitForListener(ctx, address, exited); err != nil {
		return err
	}
	target := &url.URL{Scheme: "http", Host: address}
	page := &httputil.ReverseProxy{
		Rewrite: func(r *httputil.ProxyRequest) {
			r.SetURL(target)
			// Vite answers <slug>.<domain>, the host the browser asked for.
			r.Out.Host = r.In.Host
		},
	}
	return serve(ctx, page, exited)
}

// freePort is a port nothing listens on now, for Vite.
func freePort() (int, error) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return 0, err
	}
	defer listener.Close()
	return listener.Addr().(*net.TCPAddr).Port, nil
}

// waitForListener waits until address takes connections, so the first
// page load doesn't find Vite still starting, or until Vite exits.
func waitForListener(ctx context.Context, address string, exited <-chan error) error {
	for {
		if conn, err := net.DialTimeout("tcp", address, time.Second); err == nil {
			return conn.Close()
		}
		select {
		case err := <-exited:
			return err
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(100 * time.Millisecond):
		}
	}
}
