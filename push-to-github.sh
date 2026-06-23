#!/bin/zsh
set -e

cd "$(dirname "$0")"

echo "Preparing Meldex AI for GitHub..."

if [ ! -d ".git" ]; then
  git init
fi

git branch -M main

if git remote get-url origin >/dev/null 2>&1; then
  git remote set-url origin "https://github.com/Sumitsavani007/Meldex-AI.git"
else
  git remote add origin "https://github.com/Sumitsavani007/Meldex-AI.git"
fi

git add .

if git diff --cached --quiet; then
  echo "No new changes to commit."
else
  git commit -m "Initial Meldex AI app"
fi

git push -u origin main

echo "Done: https://github.com/Sumitsavani007/Meldex-AI"
