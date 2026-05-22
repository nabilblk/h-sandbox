export const TEMPLATES = [
    {
        id: "python-3.12",
        name: "Python 3.12",
        description: "Bare Python with pip + uv.",
        image: "python:3.12-slim",
        icon: "py",
        tags: ["python", "cli"],
        bootMs: 126,
        visibility: "public",
        defaultEntrypoint: ["sleep", "3600"]
    },
    {
        id: "python-3.12-data",
        name: "Python 3.12 (data)",
        description: "Numpy, pandas, polars, matplotlib.",
        image: "python:3.12-slim",
        icon: "py",
        tags: ["python", "data"],
        bootMs: 137,
        visibility: "public",
        defaultEntrypoint: ["sleep", "3600"]
    },
    {
        id: "node-20",
        name: "Node 20",
        description: "Node + pnpm + bun.",
        image: "node:20-bookworm-slim",
        icon: "node",
        tags: ["node", "js"],
        bootMs: 142,
        visibility: "public",
        defaultEntrypoint: ["sleep", "3600"]
    },
    {
        id: "node-20-chromium",
        name: "Node 20 + Chromium",
        description: "Headless browser for agents.",
        image: "mcr.microsoft.com/playwright:v1.57.0-noble",
        icon: "globe",
        tags: ["browser", "node"],
        bootMs: 184,
        visibility: "public",
        defaultEntrypoint: ["sleep", "3600"]
    },
    {
        id: "ubuntu-24.04",
        name: "Ubuntu 24.04",
        description: "Plain devbox, root, apt available.",
        image: "ubuntu:24.04",
        icon: "box",
        tags: ["os"],
        bootMs: 119,
        visibility: "public",
        defaultEntrypoint: ["sleep", "3600"]
    },
    {
        id: "custom",
        name: "Custom Dockerfile",
        description: "Bring your own image.",
        image: "ubuntu:24.04",
        icon: "file",
        tags: ["custom"],
        bootMs: 220,
        visibility: "private",
        defaultEntrypoint: ["sleep", "3600"]
    }
];
export const statusLabel = (status) => {
    if (status === "pending")
        return "running";
    return status;
};
export const apiPath = (path) => `/v1${path.startsWith("/") ? path : `/${path}`}`;
