
# Open-Fiesta


[![Open-Fiesta](public/osfiesta.png)](public/osfiesta.mp4)

An open-source, multi-model AI chat playground built with Next.js App Router. Switch between providers and models, compare outputs side-by-side, and utilize optional web search and image attachments for enhanced conversations.

## ✨ Features

- **Multiple Providers**: Gemini, OpenRouter (DeepSeek R1, Llama 3.3, Qwen, Mistral, Moonshot, Reka, Sarvam, and more)
- **Selectable Model Catalog**: Choose up to 5 models to run simultaneously
- **Web Search Toggle**: Enable web search on a per-message basis
- **Image Attachment Support**: Upload and analyze images (Gemini models)
- **Clean UI**: Keyboard submit, streaming-friendly API normalization, and intuitive interface

## 🛠 Tech Stack

- **Next.js 14** (App Router, TypeScript)
- **Tailwind CSS** for styling
- **API Routes** for provider calls and response normalization

## 🚀 Quick Start

### 1. Install Dependencies
```
npm i
```

### 2. Configure Environment
Create `.env.local` with the API keys you plan to use:

```
# OpenRouter (recommended for most free models)
OPENROUTER_API_KEY=your_openrouter_key_here

# Gemini (for Gemini models and image input)
GOOGLE_GENERATIVE_AI_API_KEY=your_gemini_key_here
```

### 3. Run Development Server
```
npm run dev
# Open http://localhost:3000
```

## 🔑 Environment Variables

| Variable | Description | Required For |
|----------|-------------|--------------|
| `OPENROUTER_API_KEY` | API key from [OpenRouter](https://openrouter.ai) | OpenRouter models |
| `GOOGLE_GENERATIVE_AI_API_KEY` | API key from Google AI Studio | Gemini models |

> **Note**: You can also provide API keys at runtime through the UI's Settings panel.

## 📁 Project Structure

```
app/
├── api/
│   ├── openrouter/route.ts    # Normalizes responses across OpenRouter models
│   ├── gemini/route.ts        # Gemini API integration
│   └── gemini-pro/route.ts    # Gemini Pro API integration
components/                    # UI components (chat box, model selector, etc.)
lib/                          # Model catalog and client helpers
```

## 🧠 Notes on DeepSeek R1

Open-Fiesta post-processes DeepSeek R1 outputs to remove reasoning tags and convert Markdown to plain text for improved readability while preserving all content integrity.

## 📄 License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgements

- Model access provided via [OpenRouter](https://openrouter.ai) and [Google AI](https://ai.google.dev)

## 👨‍💻 Credits

**Created by Kislay**
- LinkedIn: [linkedin.com/in/kislayy](https://www.linkedin.com/in/kislayy/)
- Twitter: [@whyKislay](https://twitter.com/whyKislay)

---

*Made with ❤️ for the open-source AI community*
```