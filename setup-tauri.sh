#!/bin/bash
set -e

echo "🚀 Hush v0.2.0 - Tauri Setup Script"
echo "===================================="
echo ""

# Check if Rust is installed
if ! command -v cargo &> /dev/null; then
    echo "❌ Rust not found. Installing..."
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
    source "$HOME/.cargo/env"
    echo "✅ Rust installed"
else
    echo "✅ Rust already installed"
fi

# Check if Tauri CLI is installed
if ! command -v cargo-tauri &> /dev/null; then
    echo "📦 Installing Tauri CLI..."
    cargo install tauri-cli --version 2.0.0-rc
    echo "✅ Tauri CLI installed"
else
    echo "✅ Tauri CLI already installed"
fi

# Check if libtaior is compiled
LIBTAIOR_PATH="../libtaior"
if [ ! -d "$LIBTAIOR_PATH" ]; then
    echo "❌ libtaior not found at $LIBTAIOR_PATH"
    echo "Please clone libtaior:"
    echo "  cd .. && git clone https://github.com/taiorproject/libtaior"
    exit 1
fi

if [ ! -f "$LIBTAIOR_PATH/target/release/libtaior.rlib" ]; then
    echo "📦 Compiling libtaior..."
    cd "$LIBTAIOR_PATH"
    cargo build --release
    cd - > /dev/null
    echo "✅ libtaior compiled"
else
    echo "✅ libtaior already compiled"
fi

# Install Node dependencies
echo "📦 Installing Node dependencies..."
npm install
echo "✅ Node dependencies installed"

# Create icons directory if it doesn't exist
if [ ! -d "src-tauri/icons" ]; then
    echo "📁 Creating icons directory..."
    mkdir -p src-tauri/icons
    
    # Create placeholder icons (you should replace these with real icons)
    echo "⚠️  Placeholder icons created. Replace with real icons in src-tauri/icons/"
fi

echo ""
echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "  1. Run development: npm run tauri:dev"
echo "  2. Build production: npm run tauri:build"
echo ""
echo "Optional: Run local relay node for testing:"
echo "  cd ../libtaior && cargo run --example relay_server -- --port 4433"
echo ""
