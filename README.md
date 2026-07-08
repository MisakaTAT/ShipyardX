<p align="center">
  <img src="./public/logo.png" alt="ShipyardX logo" width="160" />
</p>

<h1 align="center" style="margin-top: 0;">ShipyardX</h1>

<p align="center">A cross-platform Docker management client built with Tauri.</p>

## Features

- Manage local and remote Docker servers over SSH
- Check Docker availability and guide users through common access issues
- Inspect and operate containers, images, networks, and volumes
- Run containers with structured configuration for ports, volumes, environment variables, restart policies, and resource limits
- Open host terminals and container exec terminals
- Stream container logs and Docker events in real time
- Create and manage port forwarding rules
- View Docker engine status, inspect daemon settings, and apply daemon configuration updates
- Sync app store sources, browse apps, and install apps to target servers

## Requirements

- Node.js 20+
- pnpm 11
- Rust stable
- Platform dependencies required by Tauri

On macOS, install Xcode Command Line Tools:

```bash
xcode-select --install
```

## Development

After installing the required Tauri dependencies, run:

```bash
pnpm i
pnpm tauri dev
```

## Contributions

Issue and PR welcome!

## License

GPL-3.0 License. See [License here](./LICENSE) for details.
