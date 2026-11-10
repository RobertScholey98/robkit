// For tests only: viewers built with the guard's own readers, so a test
// never casts to a branded id. Next's viewer() reads the request's headers,
// so a page reads it once and hands it to a plain function, and a test calls
// that function with one of these.
export { guest, nobody, owner, type GuestOptions } from "@robkit/guard/testing";
