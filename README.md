# MZLFF / PHANTASMAGORIA — fan site

Статический сайт (HTML/CSS/JS), без сборки. Работает на GitHub Pages.

## Как выложить на GitHub (проверенный способ)
1. Создай репозиторий (например `phantasmagoria`) на github.com — **без** README/лицензии.
2. Установи GitHub Desktop (или git). В GitHub Desktop: File → Add local repository → выбери эту папку
   (ту, где лежит `index.html`) → Publish repository.
   Через терминал:
   ```
   git init -b main
   git add .
   git commit -m "PHANTASMAGORIA site"
   git remote add origin https://github.com/ТВОЙ_НИК/phantasmagoria.git
   git push -u origin main
   ```
3. Settings → Pages → Source: *Deploy from a branch* → Branch: `main`, папка `/ (root)` → Save.
4. Через 1–2 минуты сайт будет на `https://ТВОЙ_НИК.github.io/phantasmagoria/`.

`index.html` должен лежать **в корне** репозитория, а не внутри подпапки.
Если при push просят пароль — нужен Personal Access Token (Settings → Developer settings → Tokens)
или вход через GitHub Desktop.
