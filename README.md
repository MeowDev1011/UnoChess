# ♟️ UnoChess 🃏

### *The chess game that dared to mix with UNO… and turned out awesome.*

[![Play Now](https://img.shields.io/badge/🎮_PLAY_NOW-unochess.pages.dev-ffcc00?style=for-the-badge&logo=cloudflare&logoColor=white)](https://unochess.pages.dev/)
[![GitHub Repo](https://img.shields.io/badge/📂_Repository-MeowDev1011%2FUnoChess-181717?style=for-the-badge&logo=github)](https://github.com/MeowDev1011/UnoChess)
[![100% Free](https://img.shields.io/badge/💯_Free_and_ad--free-00c853?style=for-the-badge)](#-project-philosophy)
[![Made with React](https://img.shields.io/badge/⚛️_React_19-61dafb?style=for-the-badge&logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178c6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

> **UnoChess** is not just chess. It is not just UNO. It is a strategic hybrid where every move matters, every card can change the fate of the game, and every match tells a different story. 🎲✨

---

## 📖 Table of Contents

- [What Is UnoChess? 🤔](#-what-is-unochess-)
- [Main Features 🌟](#-main-features-)
- [How to Play 🎯](#-how-to-play-)
- [Quick Card Guide 🃏](#-quick-card-guide-)
- [Game Modes 🎮](#-game-modes-)
- [AI Difficulty Levels 🤖](#-ai-difficulty-levels-)
- [Time Controls ⏱️](#-time-controls-️)
- [Account System & Lichess Login 🔐](#-account-system--lichess-login-)
- [Online Multiplayer 🌐](#-online-multiplayer-)
- [Available Languages 🌍](#-available-languages-)
- [Technologies Used 🛠️](#-technologies-used-️)
- [Project Structure 📁](#-project-structure-)
- [Local Installation and Development 💻](#-local-installation-and-development-)
- [Deployment 🚀](#-deployment-)
- [Future Roadmap 🔮](#-future-roadmap-)
- [Project Philosophy 💎](#-project-philosophy-)
- [Contributing 🤝](#-contributing-)
- [License 📄](#-license-)
- [Useful Links 🔗](#-useful-links-)

---

## 🤔 What Is UnoChess?

**UnoChess** is a browser-based strategy game that blends the depth of **classic chess** with the unpredictability of **UNO cards**. 🧠💥

Instead of simply moving pieces, you **draw a card** every turn. That card determines how many moves you can make, which special actions trigger, and how the board changes. Got a **+2**? Draw extra moves or recover a piece. Got a **Reverse**? The turn changes hands and the board flips. Got a **Wild**? Teleport a piece to any square. 😱

The result is a game that feels familiar to chess players yet accessible to anyone who enjoys a mental challenge. **You do not need to be a grandmaster to win… but it helps.** 😉

> 🎯 **Goal:** Checkmate the opposing king, or capture it, by using your cards and pieces intelligently.

---

## 🌟 Main Features

- 🃏 **Unique card system:** 4 colors, number cards (0–9), action cards (+2, Skip, Reverse), and Wilds (Wild, Wild +4). Each card is tied to chess mechanics.
- ♟️ **Complete chess rules:** Castling, en passant, promotion, check, checkmate, stalemate.
- 🤖 **AI with 10 difficulty levels:** From ~400 Elo to ~2200 Elo. The AI uses cards strategically, chooses Wild colors, and decides when to teleport or attack.
- 👥 **Local multiplayer:** Play on the same device in **Tabletop** (both see the board) or **Pass & Play** (screen hidden between turns).
- 🔐 **Account system & Lichess login:** Create an account or sign in with your Lichess credentials to save your progress, stats, and online profile.
- 🌐 **Online multiplayer:** Play against other players online or invite friends to a private match with a shareable link.
- ⏱️ **Varied time controls:** Unlimited, Bullet, Blitz, Rapid, and Classical presets.
- 🌍 **25-language interface:** Automatic browser detection and manual selector.
- 🎨 **Modern responsive design:** Tailwind CSS, Motion animations, Lucide icons. Works on desktop, tablet, and mobile.
- 🔊 **Immersive audio:** Sound effects for moves, captures, cards, and victory, with mute.
- 🧠 **Built-in card guide:** A modal explains every card and its effects.
- 💯 **Free and ad-free:** No monetization, no tracking. Just the game.

---

## 🎯 How to Play

1. **Choose mode:** AI 🤖, local multiplayer 👥, or online 🌐.
2. **Pick your side:** White ♔ or Black ♚.
3. **Set time control:** From lightning-fast to classical.
4. **Play!** Each turn:
   - 📤 **Draw a card** from the deck.
   - 🃏 **The card is revealed** and its effect activates.
   - ♟️ **Move your pieces** according to the card, or perform the special action.
   - 🔄 **The turn passes** (or reverses).
5. **Win** by checkmate or by capturing the enemy king. 👑

> 💡 **Pro tip:** A **0** card may lose you a turn, but sometimes it is the strategic pause you need.

---

## 🃏 Quick Card Guide

| Card | Color | Main Effect | Emoji |
|------|-------|-------------|-------|
| **0** | Any | Lose turn, recover a captured piece. | 🚫 |
| **1–9** | Any | Move **that many times** (1–9 moves). | 🔢 |
| **+2** | Any | Draw 2 cards or recover a piece; extra move possible. | ➕ |
| **Skip** | Any | Cancel opponent’s turn. | 🛑 |
| **Reverse** | Any | Flip the board 180° and change turn; can save from check. | 🔄 |
| **Wild** | Special | Choose a color and **teleport** a piece. | 🌈 |
| **Wild +4** | Special | Choose a color and **attack** an enemy piece. | 💥 |

> 📚 **Inside the game**, a detailed **Card Guide** explains every card with examples.

---

## 🎮 Game Modes

### 🤖 Against the AI

10 difficulty levels. The AI uses cards strategically, picks Wild colors, and decides when to teleport or attack. Each level adjusts aggression, search depth, and card management.

### 👥 Local Multiplayer

- **Tabletop:** Both players see the board.
- **Pass & Play:** Screen hidden between turns.

### 🌐 Online Multiplayer

Play against other players online or **invite a friend with a shareable link**. No signup required to join a match via link — just click and play. 🚀

---

## 🤖 AI Difficulty Levels

| Level | Name | Approx. Elo | Behavior |
|-------|------|-------------|----------|
| 1–3 | **Basic** 🌱 | 400–800 | Simple play, makes mistakes. |
| 4–6 | **Normal** 🌿 | 1000–1400 | Balanced strategy. |
| 7–8 | **Tactical** 🌳 | 1600–1800 | Punishes mistakes, manages resources. |
| 9–10 | **Master** 🏆 | 2000–2200 | Near-perfect, uses combos and teleports. |

> 🧪 Elo is approximate. The AI also considers board state and available cards.

---

## ⏱️ Time Controls

| Category | Presets | Description |
|----------|---------|-------------|
| **∞ Unlimited** | ∞ | No clock. Perfect for learning. |
| **Bullet** ⚡ | 1+0, 1+1, 2+1 | Ultra-fast. |
| **Blitz** 💨 | 3+0, 3+2, 5+0, 5+3 | Speed + strategy. |
| **Rapid** ⏳ | 10+0, 10+5, 15+10 | More time to plan. |
| **Classical** 🕰️ | 30+0, 30+20 | Slow, deep games. |

> ⏲️ Increment = extra seconds per turn.

---

## 🔐 Account System & Lichess Login

- **Create an account** to save your game history, stats, and online profile.
- **Sign in with Lichess:** Use your existing Lichess credentials via OAuth to log in instantly. No new password to remember. 🔑
- Your Lichess username and rating can be displayed on your profile, bridging the two communities.

> 📝 **Note:** This feature set is described based on the author's information. Verify implementation details in the source code or the live app.

---

## 🌐 Online Multiplayer

- **Play with other players online** in real-time matches.
- **Invite friends with a link:** Generate a shareable URL and send it to a friend. They click, join, and play — no signup required to accept the invite. 🔗
- **Private rooms:** Create a match and control who joins.
- **Matchmaking:** Find opponents of similar skill level (planned as the player base grows).

> 🚀 This is a core feature of UnoChess. The invite-link system is designed to make sharing and playing with friends frictionless.

---

## 🌍 Available Languages

25 languages, including:
🇪🇸 Spanish · 🇬🇧 English · 🇫🇷 French · 🇩🇪 German · 🇮🇹 Italian · 🇵🇹 Portuguese · 🇷🇺 Russian · 🇯🇵 Japanese · 🇨🇳 Chinese · 🇰🇷 Korean · 🇸🇦 Arabic · 🇮🇳 Hindi · 🇹🇷 Turkish · 🇳🇱 Dutch · 🇵🇱 Polish · 🇸🇪 Swedish · 🇳🇴 Norwegian · 🇩🇰 Danish · 🇫🇮 Finnish · 🇨🇿 Czech · 🇬🇷 Greek · 🇮🇱 Hebrew · 🇹🇭 Thai · 🇻🇳 Vietnamese · 🇮🇩 Indonesian

> 🌐 Auto-detected; change anytime from the start screen.

---

## 🛠️ Technologies Used

| Technology | Role |
|------------|------|
| ⚛️ **React 19** | UI library. |
| 📘 **TypeScript 7** | Static typing. |
| ⚡ **Vite 8** | Bundler & dev server. |
| 🎨 **Tailwind CSS 4** | Utility-first styling. |
| 🌍 **i18next** | 25-language i18n. |
| 🎞️ **Motion** | Animations. |
| 🖼️ **Lucide React** | Icons. |
| 🧠 **@google/genai** | Optional Gemini API (future). |
| 🔐 **OAuth / Lichess API** | Login with Lichess. |
| 🌐 **Realtime backend** | Online multiplayer (implementation details in code). |
| ☁️ **Cloudflare Pages** | Deployment. |
| 🛠️ **Wrangler** | CLI for Cloudflare. |

> 🧩 Modular architecture: **engine** (pure logic), **components** (UI), **types**, **i18n**, **utils**.

---

## 📁 Project Structure

```text
UnoChess/
├── .github/workflows/deploy.yml
├── public/assets/
├── src/
│   ├── components/          # StartScreen, ChessBoard, modals…
│   ├── engine/
│   │   ├── chess.ts         # Chess rules, AI, legal moves
│   │   └── deck.ts          # Deck creation & shuffling
│   ├── i18n/
│   │   ├── index.ts
│   │   ├── languages.ts
│   │   └── translations.ts
│   ├── types/game.ts
│   ├── utils/audio.ts
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
└── .env.example
```

---

## 💻 Local Installation and Development

1. **Clone:**
   ```bash
   git clone https://github.com/MeowDev1011/UnoChess.git
   cd UnoChess
   ```

2. **Install** (`npm` or `bun`):
   ```bash
   npm install
   # or
   bun install
   ```

3. **Optional env** (only if using Gemini API or OAuth):
   ```bash
   cp .env.example .env
   # Add GEMINI_API_KEY and any OAuth/Lichess credentials if needed
   ```

4. **Dev server:**
   ```bash
   npm run dev
   ```
   → `http://localhost:3000`

5. **Production build:**
   ```bash
   npm run build
   ```

6. **Preview:**
   ```bash
   npm run preview
   ```

> 🧹 `npm run clean` removes `dist` and `server.js`.

---

## 🚀 Deployment

Automated via **GitHub Actions** + **Cloudflare Pages**. On `push` to `main`, the workflow:

1. Installs dependencies.
2. Runs `npm run build`.
3. Deploys `dist/` to Cloudflare Pages via **Wrangler**.

**Requirements for your own deploy:**
- Set `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` secrets.
- Have a Cloudflare Pages project named `unochess` (or change the name in the workflow).

> 🌐 **Live demo:** [https://unochess.pages.dev/](https://unochess.pages.dev/)

---

## 🔮 Future Roadmap

- 🏆 **Ranked matches & leaderboards:** Climb the ranks.
- 🃏 **More cards & house rules:** New actions, custom decks.
- 📱 **Native mobile apps:** iOS & Android.
- 🤝 **Tournaments and community events.**

> 🚀 **None of this is possible without you.** Share the game, star the repo, and help make UnoChess famous!

---

## 💎 Project Philosophy

- **100% free and ad-free.** No monetization, no tracking.
- **Open source.** Learn, modify, improve.
- **Accessible to everyone.** Multi-language, touch controls, responsive.
- **Strategic depth.** Cards add randomness, but tactics still matter.

> ❤️ Made with care by **MeowDev1011** and the community.

---

## 🤝 Contributing

1. **Open an issue** with your idea.
2. **Fork** the repo.
3. **Create a branch** (`git checkout -b feature/new-card`).
4. **Submit a pull request.**

Please follow the existing code style and ensure `npm run lint` passes.

> 🧪 **Tip:** Test locally before submitting a PR.

---

## 📄 License

**MIT License.** See the `LICENSE` file for details.

---

## 🔗 Useful Links

- 🎮 **Play now:** [https://unochess.pages.dev/](https://unochess.pages.dev/)
- 📂 **GitHub repo:** [https://github.com/MeowDev1011/UnoChess](https://github.com/MeowDev1011/UnoChess)
- 🐛 **Report a bug:** [GitHub Issues](https://github.com/MeowDev1011/UnoChess/issues)
- 💡 **Suggest an idea:** [GitHub Discussions](https://github.com/MeowDev1011/UnoChess/discussions)
- ☁️ **Cloudflare Pages:** [Official docs](https://developers.cloudflare.com/pages/)

---

### 🌟 Thanks for checking out UnoChess!

If you like the project, **give it a star ⭐ on GitHub** and share it with your friends. Let the game begin! 🎉

**♟️ + 🃏 = ❤️**
