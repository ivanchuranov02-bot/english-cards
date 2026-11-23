# Sport English — карточки для Вани и Саши

Карточки со словами «Общеспортивная терминология», разложенными по темам как в методичке.
Сначала показывается английское слово, по нажатию открывается перевод. Свайп вправо означает «знаю», влево — «ещё учу».
Слова у вас общие, прогресс у каждого свой, и на вкладке «Прогресс» видно оба.

## Файлы

- `words.js` — все слова по темам (формат строки `английский | русский`)
- `config.js` — адрес базы и имена пользователей
- `app.js`, `style.css`, `index.html` — сам сайт (без сборки, просто статические файлы)

## Общий прогресс: Firebase (один раз, ~5 минут)

1. Зайди на https://console.firebase.google.com и нажми **Create a project** (Google Analytics можно выключить).
2. В меню слева выбери **Build → Realtime Database → Create Database**, регион `europe-west1`, режим **Start in test mode**.
3. Скопируй адрес базы сверху (вида `https://xxx-default-rtdb.europe-west1.firebasedatabase.app`) и вставь его в `config.js`:
   ```js
   window.FIREBASE_DB_URL = "https://xxx-default-rtdb.europe-west1.firebasedatabase.app";
   ```
4. На вкладке **Rules** замени правила на эти и нажми **Publish** (test mode сам отключится через 30 дней, а эти правила бессрочные и пускают только наши данные):
   ```json
   {
     "rules": {
       ".read": true,
       "progress": { "$u": { ".validate": "$u === 'vanya' || $u === 'sasha'", ".write": true,
         "$w": { ".validate": "newData.val() === 0 || newData.val() === 1" } } },
       "stars": { "$u": { ".validate": "$u === 'vanya' || $u === 'sasha'", ".write": true,
         "$w": { ".validate": "newData.val() === true" } } },
       "seen": { "$u": { ".validate": "$u === 'vanya' || $u === 'sasha'", ".write": true } }
     }
   }
   ```

Пока адрес не вставлен, сайт работает, но прогресс хранится только на одном устройстве.

## Публикация на GitHub Pages

Репозиторий → **Settings → Pages → Deploy from a branch → main / (root)**. Через минуту сайт будет по адресу
`https://<логин>.github.io/<репозиторий>/`. На iPhone: Safari → «Поделиться» → «На экран Домой», и откроется как приложение.
