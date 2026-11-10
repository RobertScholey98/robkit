// For tests only: viewers built with the guard's own readers, so a test
// never casts to a branded id. Start's server functions need Start's
// compiler, so a handler hands context.viewer to a plain function, and a
// test calls that function with one of these.
export { guest, nobody, owner, type GuestOptions } from "@robkit/guard/testing";
