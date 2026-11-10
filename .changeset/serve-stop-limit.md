---
"@robkit/serve": minor
---

The stop has a limit of 8 seconds, under Docker's 10. Then it closes every connection still open, such as one that has sent nothing, says how many, and stops as usual.
