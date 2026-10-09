## GitHub Copilot Chat

- Extension: 0.48.1 (prod)
- VS Code: 1.117.0 (10c8e557c8b9f9ed0a87f61f1c9a44bde731c409)
- OS: darwin 21.6.0 x64
- GitHub Account: ValdenLizai

## Network

User Settings:
```json
  "http.systemCertificatesNode": false,
  "github.copilot.advanced.debug.useElectronFetcher": true,
  "github.copilot.advanced.debug.useNodeFetcher": false,
  "github.copilot.advanced.debug.useNodeFetchFetcher": true
```

Connecting to https://api.github.com:
- DNS ipv4 Lookup: 20.87.245.6 (7432 ms)
- DNS ipv6 Lookup: ::ffff:20.87.245.6 (15 ms)
- Proxy URL: None (1 ms)
- Electron fetch (configured): timed out after 10 seconds
- Node.js https: timed out after 10 seconds
- Node.js fetch: timed out after 10 seconds

Connecting to https://api.individual.githubcopilot.com/_ping:
- DNS ipv4 Lookup: 140.82.114.22 (5845 ms)
- DNS ipv6 Lookup: ::ffff:140.82.114.22 (175 ms)
- Proxy URL: None (1 ms)
- Electron fetch (configured): HTTP 200 (7422 ms)
- Node.js https: timed out after 10 seconds
- Node.js fetch: timed out after 10 seconds

Connecting to https://proxy.individual.githubcopilot.com/_ping:
- DNS ipv4 Lookup: 20.199.39.224 (4571 ms)
- DNS ipv6 Lookup: ::ffff:20.199.39.224 (19 ms)
- Proxy URL: None (13 ms)
- Electron fetch (configured): timed out after 10 seconds
- Node.js https: timed out after 10 seconds
- Node.js fetch: HTTP 200 (7879 ms)

Connecting to https://mobile.events.data.microsoft.com: timed out after 10 seconds
Connecting to https://dc.services.visualstudio.com: timed out after 10 seconds
Connecting to https://copilot-telemetry.githubusercontent.com/_ping: timed out after 10 seconds
Connecting to https://telemetry.individual.githubcopilot.com/_ping: timed out after 10 seconds
Connecting to https://default.exp-tas.com: Error (9985 ms): Error: read ECONNRESET
	at TLSWrap.onStreamRead (node:internal/stream_base_commons:216:20)

Number of system certificates: 6

## Documentation

In corporate networks: [Troubleshooting firewall settings for GitHub Copilot](https://docs.github.com/en/copilot/troubleshooting-github-copilot/troubleshooting-firewall-settings-for-github-copilot).