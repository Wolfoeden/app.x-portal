# Prototyp der neuen Website (Sicherung)

`xportal-web.tar.gz` enthält den Quellcode des Prototyps für den Neustart in
`Wolfoeden/x-portal`. Die Vorschau läuft unter https://xportal-vorschau.netlify.app (noindex).
Der Code wird dort weitergeführt. Hier liegt er nur, damit er nicht verloren geht,
bis das neue Repo erreichbar ist.

Gepackt sind nur Quellen: kein `node_modules`, `.next` oder `out`. Als Archiv ist er
für Typecheck, Lint und Build dieses Repos unsichtbar.

```sh
tar -xzf prototype/xportal-web.tar.gz -C /tmp
cd /tmp/xportal-web && pnpm install && pnpm build
```
