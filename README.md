# SaaS Admin Template

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/dijnie/worker-crm)

![SaaS Admin Template](https://imagedelivery.net/wSMYJvS3Xw-n339CbDyDIA/52b88668-0144-489c-dd02-fe620270ba00/public)

<!-- dash-content-start -->

A complete admin dashboard template built with Vinext, Shadcn UI, Drizzle ORM, and Cloudflare's developer stack. Quickly deploy a fully functional admin interface with customer and subscription management capabilities.

## Features

- 🎨 Modern UI built with Vinext, Pages Router, and Shadcn UI
- 🔐 Built-in API with token authentication
- 👥 Customer management
- 💳 Subscription tracking
- 🚀 Deploy to Cloudflare Workers
- 📦 Powered by Cloudflare D1 database & Drizzle ORM
- ✨ Clean, responsive interface
- 🔍 Data validation with Zod

## Tech Stack

- Framework: [Vinext](https://vinext.dev) (Next.js Pages Router on Cloudflare Workers)
- UI Components: [Shadcn UI](https://ui.shadcn.com)
- Database: [Cloudflare D1](https://developers.cloudflare.com/d1)
- ORM: [Drizzle ORM](https://orm.drizzle.team)
- Deployment: [Cloudflare Workers](https://workers.cloudflare.com)
- Validation: [Zod](https://github.com/colinhacks/zod)

<!-- dash-content-end -->

## Setup Steps

1. Install dependencies:

```bash
npm install
```

2. Set up your environment variables:

```bash
# Create a .dev.vars file for local development
cp .dev.vars.example .dev.vars
```

Add your API token:

```
API_TOKEN=your_token_here
```

3. Run migrations locally:

```bash
npm run db:migrate
```

4. Run the development server:

```bash
npm run dev
```

Or build and run on the local Worker runtime:

```bash
npm run build
npm run start
```
