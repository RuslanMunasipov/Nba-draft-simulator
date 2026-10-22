# Арт лиги для карточек

Сюда лига кладёт картинки, сделанные в ChatGPT. Бот наград подхватывает их сам, со следующего поста. Код менять не нужно.

## Праздничные слои — главное место

Папка `design/holidays/`. Имя файла: ключ праздника из таблицы внизу, дефис и слой.

| Файл | Где на карточке | Формат |
|---|---|---|
| `<ключ>-bg.png` | подложка **всех** карточек альбома праздника | портрет 1024×1536 (или 1080×1350), без текста |
| `<ключ>-emblem.png` | эмблема в центре открывашки вместо кодовой (кольцо с логотипом) | квадрат 1024×1024, прозрачный фон |
| `<ключ>-title-day.png` | надпись «Итоги игрового дня» на открывашке дня | 1536×1024, прозрачный фон |
| `<ключ>-title-week.png` | надпись «Итоги недели» на открывашке недели | 1536×1024, прозрачный фон |
| `<ключ>-title-month.png` | надпись «Символическая пятёрка» на открывашке месяца | 1536×1024, прозрачный фон |

Пример для Хэллоуина: `halloween-bg.png`, `halloween-emblem.png`, `halloween-title-day.png`.

- **Дату рисует код** под надписью, её на картинке быть не должно. Подпись под датой (праздник, неделя) тоже рисует код.
- **Слоя нет — оформление прежнее.** Можно положить только фон или только эмблему: остальное бот нарисует сам.
- **Пустые прозрачные поля обрезаются сами.** Эмблема вписывается в квадрат 600×600, надпись — в полосу 960×230 px, поэтому лишний воздух вокруг не страшен.
- Фон обрезается до 4:5 по центру: важное не ставьте у самого верха и низа. Поверх фона бот кладёт тёмную вуаль, сильнее в центре, где лежат цифры.
- Подходят `.png`, `.webp` и `.jpg`, но у эмблемы и надписей нужна прозрачность, то есть PNG или WebP.
- Ошибка в имени файла (не тот ключ или слой) роняет проверку `npm test`, так что опечатка не пройдёт незаметно.

Как загрузить с телефона: GitHub → репозиторий → папка `design/holidays` → Add file → Upload files. Файл из ChatGPT переименуйте по таблице, например `halloween-emblem.png`.

## Старые места

Они работают, но слои из `design/holidays` важнее.

| Папка | Что | Формат |
|---|---|---|
| `design/backgrounds/<праздник>.png` | фон карточек праздника | портрет, 1024×1536 или 1080×1350, без текста |
| `design/logos/<праздник>.png` | логотип лиги, «переодетый» под праздник: встаёт в кодовую эмблему, если нет `<ключ>-emblem` | квадрат 1024×1024, прозрачный фон |

Порядок фона: `design/holidays/<ключ>-bg` → `design/backgrounds/<ключ>` → фон, который бот нарисовал сам (`awards-bot/assets/holidays/<ключ>-bg.webp`) → рамка праздника → эмодзи.

## Промпты для слоёв

Стиль лиги: тёмный, сдержанный, премиальный. Глубокий чёрный и тёмно-синий, матовое золото, приглушённые цвета праздника, без кислотных и неоновых тонов. Подставьте тему праздника вместо **{тема}**.

**Фон** (`<ключ>-bg.png`):

> A premium dark background for a sports awards card, portrait 2:3. Theme: **{тема}**. Deep black and midnight navy base, matte gold and muted, desaturated holiday colours as accents only, soft studio light, subtle film grain, elegant and restrained like a luxury brand campaign. The theme's motifs are few, refined and stay along the edges and corners, partly in shadow. The centre is dark, calm and empty, because white text and numbers lie on top. No neon, no acid or oversaturated colours, no text, no letters, no numbers, no logos, no people.

**Эмблема** (`<ключ>-emblem.png`). Приложите логотип лиги (`awards-bot/assets/fbl-logo.png`):

> Use the attached logo (a gold crown on a basketball) as the centre of a round premium emblem for **{тема}**. Keep the logo's exact shape and proportions. A medal-like badge: matte and brushed gold, deep black enamel, a thin ring, the theme shown by one or two refined details (for example {идея}). Dark, restrained, premium, no neon, no acid colours. Transparent background, centred, no text.

**Надпись** (`<ключ>-title-day.png`, `-title-week.png`, `-title-month.png`):

> The Russian words "**Итоги игрового дня**" as premium lettering for **{тема}**, exactly these letters, nothing else. Tall condensed sans-serif capitals, matte gold with a soft bevel and a thin dark outline, a restrained touch of the theme ({идея}). Dark-luxury style, no neon, no glow, no acid colours. Transparent background, the lettering centred, no date, no other text.

Для недели — «**Итоги недели**», для месяца — «**Символическая пятёрка**». ChatGPT иногда путает кириллицу: перед загрузкой проверьте каждую букву.

Посмотреть результат до поста:

```sh
node awards-bot/bot.mjs --preview 2026-10-21 --cards out/cards --holiday halloween
```

## Логотип праздника (`design/logos`)

Приложите оригинал логотипа (`awards-bot/assets/fbl-logo.png` или исходник лиги) и напишите:

> Use the attached logo (a gold crown on a basketball). Keep its exact shape, proportions and gold colour. Dress it for **{праздник}**: {идея}. Transparent background, centred, no text.

Идеи для логотипа и эмблемы (`{идея}` в промптах выше):
- `new-year` — снег на короне, мяч как ёлочный шар;
- `christmas` — шапка Санты на короне;
- `halloween` — мяч-тыква с вырезанным лицом, паутина на короне;
- `st-patrick` — цилиндр лепрекона, клевер;
- `valentine` — мяч-сердце.

## Ключи праздников

| Ключ | Праздник |
|---|---|
| `fbl-start` | 🏀 Старт сезона FBL |
| `fbl-end` | 🏁 Финиш сезона FBL |
| `trade-deadline` | 🔁 Дедлайн обменов НБА |
| `all-star` | 🌟 Матч всех звёзд |
| `play-in` | 🎟️ Плей-ин |
| `playoffs` | 🏆 Старт плей-офф |
| `halloween` | 🎃 Хэллоуин |
| `thanksgiving` | 🦃 День благодарения |
| `christmas` | 🎄 Рождество |
| `new-year` | 🎆 Новый год |
| `orthodox-christmas` | ⭐ Рождество Христово |
| `old-new-year` | 🥂 Старый Новый год |
| `mlk` | 🕊️ День Мартина Лютера Кинга |
| `lunar-new-year` | 🧧 Китайский Новый год |
| `valentine` | ❤️ День святого Валентина |
| `defender` | 🎖️ 23 февраля |
| `womens-day` | 💐 8 марта |
| `maslenitsa` | 🥞 Масленица |
| `st-patrick` | ☘️ День святого Патрика |
| `april-fools` | 🤡 День смеха |
| `cosmonautics` | 🚀 День космонавтики |
| `easter` | 🥚 Пасха |
| `may-day` | 🌷 Первомай |
| `victory-day` | 🎆 День Победы |
| `russia-day` | 🇷🇺 День России |


## Проверить, как выглядит

```sh
node awards-bot/bot.mjs --preview 2026-10-21 --cards out/cards --holiday halloween
```
