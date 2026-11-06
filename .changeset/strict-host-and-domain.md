---
"@robkit/input": patch
---

`readDomain` and `readHost` refuse a label over 63 characters, a name over 253, and stray dots, hyphens or other punctuation. `readDomain` refuses an IP address. `readHost` takes an IPv4 address in dotted decimal, an IPv6 address without brackets or a zone, such as `::` or `::1`, or a host name.
