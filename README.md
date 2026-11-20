# Hey Boot

A new Marine texts what he needs before SOI. Hey Boot remembers his sizes and budget, finds the best price including military discounts, sends an approve card, buys it on YES (Stripe test mode), and shows a receipt with every source and step.

**Start here: read [AGENTS.md](AGENTS.md).** It has the spec, the hard rules, and who owns which files.

## Team and branches

| Who | Branch | Owns |
|---|---|---|
| Jameel | `main` | infra, schema, `/chat` route, audit writer, `data/` |
| Ben | `agent-loop` | tool loop, YES fast path, crisis classifier, inbound routing |
| Keanu | `integrations` | Senso, Stripe and Cognee wrappers |
| Onyu | `receipt-page` | receipt page + components, scoring, `data/catalog.csv` |

Exact file paths for each owner are in [AGENTS.md](AGENTS.md#who-owns-what-read-this-first).

## How to contribute

1. Accept the GitHub invite (check your notifications or email).
2. Clone and switch to your branch:
   ```sh
   git clone https://github.com/cutiepatootiebear/heyboot-hack.git
   cd heyboot-hack
   git checkout <your-branch>
   npm install
   cp .env.example .env.local   # fill in only the keys you need
   ```
3. Point your coding agent at `AGENTS.md` and your issue before it writes anything.
4. Work only in your files. Open a PR to `main`.
5. Never commit `.env*` files. Only `.env.example` is tracked.

Running the full app (`npm run dev`) needs access to the Convex team. Ask Jameel.

## Links

- Team Brief: https://claude.ai/artifact/MFYXReLSp7hkD8Lpp1Qf53
- Issues: https://github.com/cutiepatootiebear/heyboot-hack/issues
- Live app: https://heyboot-hack.vercel.app
