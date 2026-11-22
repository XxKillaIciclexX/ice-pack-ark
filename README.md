# ice-pack-ark


## Multiple dinosaurs in custom gift rules

Set the dinosaur quantity on a custom rule or Kit entry to the number of supported wild dinosaurs the gift should spawn. The engine expands the full reward in Preview mode. In Live mode it waits at least six seconds after each dinosaur send completes before sending the next dinosaur, to allow for the ASA mod's five-second cooldown. Use one spawn path at a time. Stop cancels remaining sends, including those waiting for the cooldown.

The existing eight-command limit applies to the whole gift. Each dinosaur takes one slot, and each item action takes one slot regardless of its quantity. RCON send results still require in-game confirmation.

Run the offline engine tests with `node --test ./*.test.mjs` in a shell that expands the glob, or `node --test "**/*.test.mjs"` on Node.js 22 or newer.
