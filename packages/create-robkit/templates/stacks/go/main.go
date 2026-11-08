// The app's server. With no command it serves the built page and the API,
// as the app's container does. The package.json scripts run the others:
//
//	go run . dev      serves the page through Vite, as pnpm dev does
//	go run . migrate  applies the migrations that haven't run
package main

import (
	"context"
	"fmt"
	"os"
	"os/signal"
	"syscall"
)

func main() {
	if err := run(os.Args[1:]); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func run(args []string) error {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	command := ""
	if len(args) > 0 {
		command = args[0]
	}
	switch command {
	case "":
		return serve(ctx, builtPage(os.DirFS("dist/public")), nil)
	case "dev":
		return dev(ctx)
	case "migrate":
		return migrate(ctx)
	}
	return fmt.Errorf("%q isn't a command. Run the server with no command, or with dev or migrate", command)
}
