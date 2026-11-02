# Fullstack Portfolio

This is my personal portfolio project hosted at [balint.halacsy.com](https://balint.halacsy.com).  
It showcases a custom fullstack setup with a **Astro/React frontend**,  
an **Golang (Gin) backend**, and a [**custom Redis clone**](https://github.com/BHalacsy/Redis-Clone).  
Everything is containerized with **Docker Compose** and deployed on a NAS through **Cloudflare Tunnels**.

## Tech stack

### Frontend
- **HTML + Astro & React**
- **TailwindCSS** (with [Rombo](https://rombo.co/tailwind/) and [tailwind-intersect](https://github.com/heidkaemper/tailwindcss-intersect) plugins)
- Built into static assets served by domain hoster IONOS.

### Backend
- **Gin framework**
- Provides endpoints for portfolio features (e.g. chat, page views, etc.)
- Centrifuge websockets for real-time event
- Connects to the custom Redis clone for data storage

### Database
- **Custom Redis Clone (C++)**
- Implements persistence, pub/sub, and concurrent access
- Built by me

### Infrastructure
- **Docker & Docker Compose** for container orchestration
- **Cloudflare Tunnels** to expose services securely
- Hosted on a self-managed **Synology NAS**

## Features
- Modern, resposive frontend UI
- Anon real-time chatroom and **persistent** collabrative canvas
- View counter, Dark mode and more.


## Repo structure
```
.
├── archive/        # Old version of the same website in TS + .NET
├── frontend/       # Astro (index.astro) + assets (public)
├── backend/        # Gin (main.go) + Dockerfile for compose.
├── docker-compose.yml # Used for deployment with cloudflared service
└── README.md
```

## Setup for development

1. Frontend
```
cd frontend
npm install
npm run dev
```
*--separate terminal--*
```
cd frontend
npm run tailwind
```

2. Backend (default port 5127)
```
cd backend
go run .
```

3. Database (default port 6379)
To run it, check out my redis clone repo [here](https://github.com/BHalacsy/Redis-Clone).

## Setup for running

1. Clone Redis to same folder as the portfolio
2. Run docker-compose
```
docker-compose up -d --build
```
3. Frontend
```
cd frontend
npm run dev
```
## Future development

Would look into React in the future to simplify the frontend process. Add additional UI features.
