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

**UnoChess** is a browser-based strategy game that blends the depth of **classic chess** with the unpredictability and controlled chaos of **UNO cards**. 🧠💥

Instead of simply moving pieces, you **draw a card** every turn. That card determines how many moves you can make, which special actions are triggered, and how the board changes. Got a **+2**? Draw extra moves or recover a piece. Got a **Reverse**? The turn changes hands and the board flips. Got a **Wild**? Teleport a piece to any square. 😱

The result is a game that feels familiar to chess players, yet accessible and fun for anyone who enjoys a good mental challenge. **You do not need to be a grandmaster to win… but it helps.** 😉

> 🎯 **Goal:** Checkmate the opposing king, or capture it depending on the situation, by using your cards and pieces intelligently.

---

## 🌟 Main Features

- 🃏 **Unique card system:** 4 colors, number cards from 0 to 9, action cards such as +2, Skip, and Reverse, plus Wild and Wild +4. Each card is tied to chess mechanics.
- ♟️ **Complete chess rules:** All classic rules are implemented: castling, en passant, promotion, check, checkmate, and stalemate.
- 🤖 **AI with 10 difficulty levels:** From a relaxed bot around 400 Elo to a tactical master around 2200 Elo. The AI also uses cards and teleports.
- 👥 **Local multiplayer:** Play on the same device in two styles: **Tabletop** where both players see the board, or **Pass & Play** where the screen is hidden between turns.
- ⏱️ **Varied time controls:** Unlimited, Bullet, Blitz, Rapid, and Classical presets.
- 🌍 **Multi-language interface:** Full translations for **25 languages**, with automatic browser language detection.
- 🎨 **Modern responsive design:** Clean interface with Tailwind CSS, smooth Motion animations, and Lucide icons. Works on desktop, tablet, and mobile.
- 🔊 **Immersive audio:** Sound effects for moves, captures, cards, and victory, with a mute option.
- 🧠 **Built-in card guide:** A modal explains every card and its effects so you never get lost.
- 💯 **Free and ad-free:** No monetization, no tracking, no distractions. Just the game.

---

## 🎯 How to Play

1. **Choose your mode:** Play against the AI 🤖 or local multiplayer 👥.
2. **Pick your side:** White ♔ or Black ♚.
3. **Set the time control:** From lightning-fast games to relaxed classical matches.
4. **Start playing!** On each turn:
   - 📤 **Draw a card** from the deck. The card determines your actions.
   - 🃏 **The card is revealed** and its effect activates.
   - ♟️ **Move your pieces** according to the number of allowed moves, or perform the special action.
   - 🔄 **The turn passes** to your opponent, or reverses if a Reverse card was played.
5. **Win** by delivering checkmate or capturing the enemy king. 👑

> 💡 **Pro tip:** Do not underestimate the power of a **0** card. Even though you lose the turn, sometimes it is the strategic pause you need to reorganize.

---

## 🃏 Quick Card Guide

| Card | Color | Main Effect | Emoji |
|------|-------|-------------|-------|
| **0** | Any | You lose the turn, but you may recover a captured piece. | 🚫 |
| **1–9** | Any | Allows you to move **that many times** from 1 to 9 moves. | 🔢 |
| **+2 (Draw Two)** | Any | Draw 2 cards or recover a piece; you may also gain an extra move. | ➕ |
| **Skip (Block)** | Any | Cancels your opponent’s turn. | 🛑 |
| **Reverse** | Any | Flips the board 180° and changes the turn. It can save you from check. | 🔄 |
| **Wild** | Special | Choose a color and **teleport** a piece to any square. | 🌈 |
| **Wild +4** | Special | Choose a color and **attack** an enemy piece or perform a raid. | 💥 |

> 📚 **Want to know more?** Inside the game you will find a detailed **Card Guide** with explanations and examples.

---

## 🎮 Game Modes

### 🤖 Against the AI (Bot)

Face an artificial intelligence with **10 difficulty levels**. The AI does not only play chess: it also **uses cards strategically**, chooses colors for its wild cards, and decides when to teleport or attack. Each level adjusts its aggression, search depth, and card management.

### 👥 Local Multiplayer

Share the device with a friend. Two styles:

- **Tabletop:** Both players see the board at all times. Ideal for playing side by side.
- **Pass & Play:** The screen is hidden between turns so each player can plan in secret. Perfect for keeping the excitement alive.

### 🌐 Online Multiplayer *(Coming if the game becomes famous!)*

If UnoChess becomes famous, we plan to add **online play with other people** and the ability to **invite your friends to play online with a link**. Imagine sharing a single URL and jumping straight into a match together. Stay tuned! 🚀

---

## 🤖 AI Difficulty Levels

| Level | Name | Approximate Elo | Behavior |
|-------|------|-----------------|----------|
| 1–3 | **Basic** 🌱 | 400–800 | Plays simply and makes mistakes. Ideal for beginners. |
| 4–6 | **Normal** 🌿 | 1000–1400 | Balanced strategy and reasonable card usage. |
| 7–8 | **Tactical** 🌳 | 1600–1800 | Looks for strong moves, punishes mistakes, and manages resources well. |
| 9–10 | **Master** 🏆 | 2000–2200 | Near-perfect play, uses card combos and teleports to dominate. |

> 🧪 **Note:** Elo is an approximate estimate. The AI also considers board state and available cards.

---

## ⏱️ Time Controls

| Category | Available Presets | Description |
|----------|-------------------|-------------|
| **∞ Unlimited** | ∞ | Play without a clock. Perfect for learning or relaxing. |
| **Bullet** ⚡ | 1+0, 1+1, 2+1 | Ultra-fast games. Every second counts. |
| **Blitz** 💨 | 3+0, 3+2, 5+0, 5+3 | The perfect balance between speed and strategy. |
| **Rapid** ⏳ | 10+0, 10+5, 15+10 | More time to think and plan. |
| **Classical** 🕰️ | 30+0, 30+20 | For lovers of slow, deep games. |

> ⏲️ The increment, the second number, is the extra seconds you receive per turn.

---

## 🌍 Available Languages

The interface is translated into **25 languages** and counting. Some of them include:

🇪🇸 Spanish · 🇬🇧 English · 🇫🇷 French · 🇩🇪 German · 🇮🇹 Italian · 🇵🇹 Portuguese · 🇷🇺 Russian · 🇯🇵 Japanese · 🇨🇳 Chinese · 🇰🇷 Korean · 🇸🇦 Arabic · 🇮🇳 Hindi · 🇹🇷 Turkish · 🇳🇱 Dutch · 🇵🇱 Polish · 🇸🇪 Swedish · 🇳🇴 Norwegian · 🇩🇰 Danish · 🇫🇮 Finnish · 🇨🇿 Czech · 🇬🇷 Greek · 🇮🇱 Hebrew · 🇹🇭 Thai · 🇻🇳 Vietnamese · 🇮🇩 Indonesian

> 🌐 The language is detected automatically, and you can change it at any time from the start screen.

---

## 🛠️ Technologies Used

| Technology | Use in the Project |
|------------|-------------------|
| ⚛️ **React 19** | Main user interface library. |
| 📘 **TypeScript 7** | Static typing for more robust and maintainable code. |
| ⚡ **Vite 8** | Ultra-fast bundler and development server. |
| 🎨 **Tailwind CSS 4** | Utility-first styles for a modern responsive design. |
| 🌍 **i18next + react-i18next** | Internationalization system with 25 languages. |
| 🎞️ **Motion (Framer Motion)** | Smooth animations for cards, pieces, and modals. |
| 🖼️ **Lucide React** | Lightweight and elegant SVG icons. |
| 🧠 **@google/genai** | Optional Gemini API integration for future AI features. |
| ☁️ **Cloudflare Pages** | Static deployment platform with continuous integration. |
| 🛠️ **Wrangler** | CLI for deploying to Cloudflare Pages. |
| 🧪 **ESLint + Prettier** | Recommended code quality and formatting practices. |

> 🧩 The project is designed with a modular architecture: **engine** for pure chess and card logic, **components** for UI, **types** for interfaces, **i18n** for translations, and **utils** for utilities such as audio.

---

## 📁 Project Structure

```text
UnoChess/
├── .github/
│   └── workflows/
│       └── deploy.yml          # CI/CD for Cloudflare Pages
├── public/
│   └── assets/                 # Card images, pieces, and sounds
├── src/
│   ├── components/             # React components: StartScreen, ChessBoard, modals…
│   ├── engine/
│   │   ├── chess.ts            # Chess logic: moves, check, castling…
│   │   └── deck.ts             # Deck creation and card management
│   ├── i18n/
│   │   ├── index.ts            # i18next configuration
│   │   ├── languages.ts        # Supported language list
│   │   └── translations.ts     # Translation dictionaries
│   ├── types/
│   │   └── game.ts             # Game types and interfaces
│   ├── utils/
│   │   └── audio.ts            # Sound management
│   ├── App.tsx                 # Main component and state machine
│   ├── main.tsx                # Entry point
│   └── index.css               # Global styles: Tailwind
├── index.html
├── metadata.json
├── package.json
├── tsconfig.json
├── vite.config.ts
└── .env.example
```

---

## 💻 Local Installation and Development

Want to explore the code or contribute? Great! Follow these steps:

1. **Clone the repository:**
   ```bash
   git clone https://github.com/MeowDev1011/UnoChess.git
   cd UnoChess
   ```

2. **Install dependencies** using `npm` or `bun`:
   ```bash
   npm install
   # or
   bun install
   ```

3. **Configure environment variables** optionally, only if you use the Gemini API:
   ```bash
   cp .env.example .env
   # Edit .env and add your GEMINI_API_KEY if needed
   ```

4. **Start the development server:**
   ```bash
   npm run dev
   ```
   The app will be available at `http://localhost:3000`.

5. **Build for production:**
   ```bash
   npm run build
   ```
   Static files will be generated in the `dist/` folder.

6. **Preview the build:**
   ```bash
   npm run preview
   ```

> 🧹 **Extra script:** `npm run clean` removes the `dist` and `server.js` folders.

---

## 🚀 Deployment

Deployment is automated through **GitHub Actions** and **Cloudflare Pages**. Every time a `push` is made to the `main` branch, the workflow `.github/workflows/deploy.yml`:

1. Installs dependencies.
2. Runs `npm run build`.
3. Deploys the `dist` folder to Cloudflare Pages using **Wrangler**.

**Requirements for your own deployment:**

- Configure the `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` secrets in your GitHub repository.
- Have a Cloudflare Pages project named `unochess`, or change the name in the workflow.

> 🌐 **Live demo:** [https://unochess.pages.dev/](https://unochess.pages.dev/)

---

## 🔮 Future Roadmap

We have big dreams for UnoChess. 🌟

- 🌐 **Online multiplayer:** If this game becomes famous, we will add the ability to play with other people online.
- 🔗 **Invite friends with a link:** Share a single link and invite your friends to play online with you instantly.
- 🏆 **Ranked matches and leaderboards:** Climb the ranks and prove you are the ultimate UnoChess master.
- 🃏 **More cards and house rules:** New action cards, custom decks, and community-created rules.
- 📱 **Native mobile apps:** Take UnoChess anywhere with dedicated iOS and Android apps.

> 🚀 **None of this is possible without you.** Share the game, give it a star, and help make UnoChess famous!

---

## 💎 Project Philosophy

UnoChess was born from a simple idea: **why choose between chess and cards when you can have both?** 🎲

- **100% free and ad-free.** No monetization, no tracking, no distractions. Just the game.
- **Open source.** All code is available so you can learn, modify, or improve it.
- **Accessible to everyone.** Multi-language interface, touch controls, responsive design, and a friendly learning curve.
- **Strategic depth.** Although cards add randomness, tactical decisions remain the heart of the game.

> ❤️ Made with care by **MeowDev1011** and the community.

---

## 🤝 Contributing

Contributions are welcome! If you have ideas for new cards, AI improvements, translations, or bug fixes, feel free to:

1. **Open an issue** describing your proposal.
2. **Fork** the repository.
3. **Create a branch** with your feature:
   ```bash
   git checkout -b feature/new-card
   ```
4. **Submit a pull request** explaining the changes.

Please follow the existing code style and make sure `npm run lint` passes without errors.

> 🧪 **Tip:** Before submitting a PR, test your change locally and, if possible, add tests. The project does not yet have a formal test suite, but every contribution helps.

---

## 📄 License

This project is under the **MIT License**. See the `LICENSE` file for more details. If the file does not exist, MIT is assumed due to the open-source nature of the repository.

---

## 🔗 Useful Links

- 🎮 **Play now:** [https://unochess.pages.dev/](https://unochess.pages.dev/)
- 📂 **GitHub repository:** [https://github.com/MeowDev1011/UnoChess](https://github.com/MeowDev1011/UnoChess)
- 🐛 **Report a bug:** [GitHub Issues](https://github.com/MeowDev1011/UnoChess/issues)
- 💡 **Suggest an idea:** [GitHub Discussions](https://github.com/MeowDev1011/UnoChess/discussions)
- ☁️ **Cloudflare Pages:** [Official documentation](https://developers.cloudflare.com/pages/)

---

### 🌟 Thanks for checking out UnoChess!

If you like the project, **give it a star ⭐ on GitHub** and share it with your friends. Let the game begin! 🎉

**♟️ + 🃏 = ❤️**
