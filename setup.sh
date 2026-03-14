#!/bin/bash

echo "🎵 Muse Parse - Setup Script"
echo "================================"
echo ""

# Check if .env exists
if [ ! -f .env ]; then
    echo "⚠️  .env file not found. Creating from .env.example..."
    cp .env.example .env
    echo "✅ .env created. Please update with your API URLs."
    echo ""
else
    echo "✅ .env file already exists"
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm install

if [ $? -eq 0 ]; then
    echo "✅ Dependencies installed successfully"
else
    echo "❌ Failed to install dependencies"
    exit 1
fi

echo ""
echo "================================"
echo "✨ Setup complete!"
echo ""
echo "Next steps:"
echo "1. Edit .env and configure your API URLs"
echo "2. Run 'npm run dev' to start development server"
echo "3. Run 'npm run electron:dev' to launch the Electron app"
echo ""
echo "📖 See README_IMPLEMENTATION.md for detailed documentation"
