# ice-pack-ark


## Multiple dinosaurs in custom gift rules

Set the dinosaur quantity on a custom rule or Kit entry to the number of supported wild dinosaurs the gift should spawn. The engine expands the full reward in Preview mode. In Live mode it waits at least six seconds after each dinosaur send completes before sending the next dinosaur, to allow for the ASA mod's five-second cooldown. Use one spawn path at a time. Stop cancels remaining sends, including those waiting for the cooldown.

The existing eight-command limit applies to the whole gift. Each dinosaur takes one slot, and each item action takes one slot regardless of its quantity. RCON send results still require in-game confirmation.

Run the offline engine tests with `node --test ./*.test.mjs` in a shell that expands the glob, or `node --test "**/*.test.mjs"` on Node.js 22 or newer.

The Custom Gift Rules panel shows sent versus total commands for the active gift, along with the next spawn's cooldown. Its last-delivery summary distinguishes completed sends, canceled work, and an RCON error. Completed sends still require in-game confirmation.

Expand **Recent gift deliveries** for up to 20 outcomes from the current session. Queued gifts that expire or are canceled before sending appear with 0 sends. Preview events stay in the event log. Restarting the engine clears the delivery list.

Select **Download delivery history** to save the visible session outcomes as JSON before restarting. The export uses UTC timestamps and includes gift names, sent and planned counts, and outcomes. It omits command bodies, payloads and player IDs. Downloads are available once there is at least one delivery outcome.

Use **Review a saved report** to reopen a version 1 delivery export. The browser validates and displays the selected file locally. The saved table stays separate from the current session, and the download button continues to export the current session.

Use **Filter by gift** and **Filter by outcome** to narrow the current and saved tables together. Gift search ignores case and accepts partial names. **Clear filters** restores both views. The JSON download still contains all current-session outcomes.
